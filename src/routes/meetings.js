const express = require('express');
const { authRequired, adminOnly } = require('../middleware/auth');
const Meeting = require('../models/meeting');
const User = require('../models/user');
const { callAI } = require('../services/aiProvider');
const {
  getBillingConfig,
  computeElapsedSeconds,
  computeBillableSeconds,
  computeBillableMinutes,
} = require('../utils/sessionBilling');

const router = express.Router();

const KEY_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const MEETING_GRACE_MINUTES = 10;
const generateMeetingKeyPart = (length = 6) => {
  let result = '';
  for (let i = 0; i < length; i += 1) {
    const idx = Math.floor(Math.random() * KEY_CHARS.length);
    result += KEY_CHARS[idx];
  }
  return result;
};

async function generateUniqueMeetingKey() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `MT-${generateMeetingKeyPart(6)}`;
    // eslint-disable-next-line no-await-in-loop
    const existing = await Meeting.findOne({ meetingKey: candidate }).select('_id');
    if (!existing) {
      return candidate;
    }
  }
  throw new Error('Failed to generate unique meeting key');
}

const canAccessMeeting = (reqUser, meeting) => {
  if (!reqUser || !meeting) return false;
  if (reqUser.role === 'admin') return true;
  const uid = String(reqUser.id);
  return (
    String(meeting.mentorId || '') === uid ||
    (meeting.attendeeId && String(meeting.attendeeId) === uid)
  );
};

const extractJsonBlock = (text) => {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const noFence = raw.replace(/```json|```/gi, '').trim();
  const start = noFence.indexOf('{');
  const end = noFence.lastIndexOf('}');
  if (start >= 0 && end > start) return noFence.slice(start, end + 1);
  return '';
};

const parseSummaryJson = (text) => {
  const jsonText = extractJsonBlock(text);
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText);
  } catch (_err) {
    return null;
  }
};

const normalizeSummaryList = (value) => {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v || '').trim()).filter(Boolean).slice(0, 20);
};

// Create a mentor session (hosted by the current user)
// Requires 1 mentorSessionCredit
router.post('/', authRequired, async (req, res) => {
  const { technology, scheduledAt, studentName, durationMinutes, meetingUrl } = req.body || {};
  if (!technology || !scheduledAt) {
    return res.status(400).json({ error: 'technology and scheduledAt are required' });
  }
  const durationValue =
    durationMinutes === undefined || durationMinutes === null || durationMinutes === ''
      ? 60
      : Number(durationMinutes);
  if (!Number.isFinite(durationValue) || durationValue < 10 || durationValue > 120) {
    return res.status(400).json({ error: 'durationMinutes must be between 10 and 120' });
  }
  const scheduledDate = new Date(scheduledAt);
  if (Number.isNaN(scheduledDate.getTime())) {
    return res.status(400).json({ error: 'scheduledAt must be a valid date' });
  }
  if (scheduledDate.getTime() <= Date.now()) {
    return res.status(400).json({ error: 'scheduledAt must be in the future' });
  }

  try {
    const meetingKey = await generateUniqueMeetingKey();
    const expiresAt = new Date(
      scheduledDate.getTime() + (durationValue + MEETING_GRACE_MINUTES) * 60 * 1000
    );

    const meeting = await Meeting.create({
      mentorId: req.user.id,
      technology: String(technology).trim(),
      studentName: studentName ? String(studentName).trim() : '',
      scheduledAt: scheduledDate,
      durationMinutes: durationValue,
      expiresAt,
      meetingKey,
      meetingUrl: meetingUrl ? String(meetingUrl).trim() : '',
      status: 'SCHEDULED',
      creditCharged: false,
      creditRefunded: false,
      totalSessionSeconds: 0,
      billedSeconds: 0,
    });

    return res.status(201).json(meeting);
  } catch (err) {
    console.error('Failed to create meeting', err);
    return res.status(500).json({ error: 'Failed to create meeting' });
  }
});

// Meetings hosted by the current user (legacy endpoint)
router.get('/mine', authRequired, async (req, res) => {
  try {
    const meetings = await Meeting.find({ mentorId: req.user.id }).sort({ scheduledAt: -1 });
    res.json(meetings);
  } catch (err) {
    console.error('Failed to load meetings', err);
    res.status(500).json({ error: 'Failed to load meetings' });
  }
});

// Meetings where current user is host OR attendee
router.get('/my', authRequired, async (req, res) => {
  try {
    const uid = String(req.user.id);
    const meetings = await Meeting.find({
      $or: [{ mentorId: uid }, { attendeeId: uid }],
    }).sort({ scheduledAt: -1 });
    res.json(meetings);
  } catch (err) {
    console.error('Failed to load meetings', err);
    res.status(500).json({ error: 'Failed to load meetings' });
  }
});

// Join via session key. First join locks attendeeId.
router.post('/join', authRequired, async (req, res) => {
  const { meetingKey } = req.body || {};
  if (!meetingKey) {
    return res.status(400).json({ error: 'meetingKey is required' });
  }
  try {
    const key = String(meetingKey).trim().toUpperCase();
    const meeting = await Meeting.findOne({ meetingKey: key });
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    if (meeting.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Meeting already completed' });
    }
    if (meeting.status === 'EXPIRED') {
      return res.status(400).json({ error: 'Meeting expired' });
    }

    // Host can also "join" by key (useful for opening quickly)
    const isHost = String(meeting.mentorId) === String(req.user.id);

    // Lock attendee on first join (non-host)
    if (!isHost) {
      if (meeting.attendeeId && String(meeting.attendeeId) !== String(req.user.id)) {
        return res.status(400).json({ error: 'This key is already used by another user' });
      }
      if (!meeting.attendeeId) {
        const me = await User.findById(req.user.id).select('name').lean();
        const myName = me?.name ? String(me.name) : '';

        meeting.attendeeId = req.user.id;
        meeting.attendeeName = myName;
        meeting.attendeeJoinedAt = meeting.attendeeJoinedAt || new Date();

        // Keep legacy display field in sync so existing UI renders nicely.
        if (!meeting.studentName) {
          meeting.studentName = myName;
        }
      }
    }

    // If host joins via this endpoint, track it.
    if (isHost) {
      meeting.mentorJoinedAt = meeting.mentorJoinedAt || new Date();
    }

    await meeting.save();
    return res.json(meeting);
  } catch (err) {
    console.error('Failed to join meeting', err);
    return res.status(500).json({ error: 'Failed to join meeting' });
  }
});

// Update meeting status (host only)
router.post('/:id/status', authRequired, async (req, res) => {
  const { status } = req.body || {};
  const validStatuses = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    if (String(meeting.mentorId) !== String(req.user.id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized for this meeting' });
    }
    if (meeting.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Meeting already completed' });
    }
    if (meeting.status === 'EXPIRED') {
      return res.status(400).json({ error: 'Meeting expired' });
    }
    meeting.status = status;
    if (status === 'IN_PROGRESS') {
      meeting.mentorJoinedAt = meeting.mentorJoinedAt || new Date();
      if (!meeting.sessionStartedAt) {
        meeting.sessionStartedAt = new Date();
      }
      meeting.sessionEndedAt = undefined;
    }
    if (status === 'COMPLETED') {
      meeting.sessionEndedAt = meeting.sessionEndedAt || new Date();
    }
    await meeting.save();
    res.json(meeting);
  } catch (err) {
    console.error('Failed to update meeting status', err);
    res.status(500).json({ error: 'Failed to update meeting status' });
  }
});

// Update meeting details (host only, while SCHEDULED)
router.put('/:id', authRequired, async (req, res) => {
  const { scheduledAt, technology, studentName, durationMinutes, meetingUrl } = req.body || {};
  if (!scheduledAt && !technology && !studentName && durationMinutes === undefined && meetingUrl === undefined) {
    return res
      .status(400)
      .json({ error: 'Provide at least one of scheduledAt, technology, studentName, meetingUrl, or durationMinutes' });
  }

  let durationValue;
  if (durationMinutes !== undefined) {
    durationValue = Number(durationMinutes);
    if (!Number.isFinite(durationValue) || durationValue < 10 || durationValue > 120) {
      return res.status(400).json({ error: 'durationMinutes must be between 10 and 120' });
    }
  }

  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    if (String(meeting.mentorId) !== String(req.user.id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized for this meeting' });
    }
    if (!['SCHEDULED', 'PENDING', 'APPROVED'].includes(meeting.status)) {
      return res.status(400).json({ error: 'Meeting can only be edited before it starts' });
    }

    if (scheduledAt) {
      const scheduledDate = new Date(scheduledAt);
      if (Number.isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ error: 'scheduledAt must be a valid date' });
      }
      meeting.scheduledAt = scheduledDate;
    }
    if (technology && String(technology).trim()) {
      meeting.technology = String(technology).trim();
    }
    if (typeof studentName === 'string') {
      meeting.studentName = studentName.trim();
    }
    if (durationValue !== undefined) {
      meeting.durationMinutes = durationValue;
    }
    if (meetingUrl !== undefined) {
      meeting.meetingUrl = String(meetingUrl || '').trim();
    }
    if (scheduledAt || durationValue !== undefined) {
      const baseDate = meeting.scheduledAt;
      const duration = durationValue !== undefined ? durationValue : meeting.durationMinutes || 60;
      meeting.expiresAt = new Date(
        baseDate.getTime() + (duration + MEETING_GRACE_MINUTES) * 60 * 1000
      );
    }

    await meeting.save();
    res.json(meeting);
  } catch (err) {
    console.error('Failed to update meeting', err);
    res.status(500).json({ error: 'Failed to update meeting' });
  }
});

// Admin: list all meetings
router.get('/admin', authRequired, adminOnly, async (req, res) => {
  try {
    const meetings = await Meeting.find().sort({ scheduledAt: -1 });
    res.json(meetings);
  } catch (err) {
    console.error('Failed to load meetings for admin', err);
    res.status(500).json({ error: 'Failed to load meetings' });
  }
});

// Legacy admin pending endpoint: no approval flow anymore.
router.get('/pending', authRequired, adminOnly, async (_req, res) => {
  res.json([]);
});

// Legacy admin update endpoint: kept for backwards compatibility.
router.put('/:id/admin', authRequired, adminOnly, async (req, res) => {
  const { status, scheduledAt, durationMinutes } = req.body || {};
  let durationValue;
  if (durationMinutes !== undefined) {
    durationValue = Number(durationMinutes);
    if (!Number.isFinite(durationValue) || durationValue < 10 || durationValue > 120) {
      return res.status(400).json({ error: 'durationMinutes must be between 10 and 120' });
    }
  }
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    if (status && ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED'].includes(status)) {
      meeting.status = status;
    }
    if (scheduledAt) {
      const scheduledDate = new Date(scheduledAt);
      if (Number.isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ error: 'scheduledAt must be a valid date' });
      }
      meeting.scheduledAt = scheduledDate;
    }
    if (durationValue !== undefined) {
      meeting.durationMinutes = durationValue;
    }
    if (scheduledAt || durationValue !== undefined) {
      const baseDate = meeting.scheduledAt;
      const duration = durationValue !== undefined ? durationValue : meeting.durationMinutes || 60;
      meeting.expiresAt = new Date(
        baseDate.getTime() + (duration + MEETING_GRACE_MINUTES) * 60 * 1000
      );
    }
    await meeting.save();
    res.json(meeting);
  } catch (err) {
    console.error('Failed to update meeting by admin', err);
    res.status(500).json({ error: 'Failed to update meeting' });
  }
});

// Delete meeting
// - Admin can delete any meeting
// - Host (mentorId) can delete meetings they created
router.delete('/:id', authRequired, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const isAdmin = req.user?.role === 'admin';
    const isHost = String(meeting.mentorId || '') === String(req.user?.id || '');

    if (!isAdmin && !isHost) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await meeting.deleteOne();
    res.json({ message: 'Meeting deleted' });
  } catch (err) {
    console.error('Failed to delete meeting', err);
    res.status(500).json({ error: 'Failed to delete meeting' });
  }
});

// Transcript (host, attendee, or admin)
router.get('/:id/transcript', authRequired, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    if (!canAccessMeeting(req.user, meeting)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json({ transcript: meeting.transcript || '' });
  } catch (err) {
    console.error('Failed to fetch transcript', err);
    res.status(500).json({ error: 'Failed to fetch transcript' });
  }
});

// Generate and store meeting summary
router.post('/:id/summary', authRequired, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    if (!canAccessMeeting(req.user, meeting)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const transcript = String(meeting.transcript || '').trim();
    if (!transcript) {
      return res.status(400).json({ error: 'No transcript available to summarize' });
    }

    const systemMsg = {
      role: 'system',
      content:
        'You are a session summarizer. Return JSON only with keys: summary (string), topics (array), strengths (array), gaps (array), next_steps (array).',
    };
    const userMsg = {
      role: 'user',
      content: `Summarize this mentoring session:\n${transcript}`,
    };

    const output = await callAI({ provider: req.body?.provider, messages: [systemMsg, userMsg] });
    const summaryJson = parseSummaryJson(output);
    const summaryTopics = normalizeSummaryList(summaryJson?.topics || summaryJson?.topic || []);

    meeting.summaryText = summaryJson?.summary ? String(summaryJson.summary) : String(output || '');
    meeting.summaryData = summaryJson || undefined;
    meeting.summaryTopics = summaryTopics;
    meeting.summaryUpdatedAt = new Date();
    await meeting.save();

    return res.json({
      summaryText: meeting.summaryText,
      summaryData: meeting.summaryData,
      summaryTopics: meeting.summaryTopics,
      summaryUpdatedAt: meeting.summaryUpdatedAt,
    });
  } catch (err) {
    console.error('Failed to generate meeting summary', err);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

// Get meeting (host, attendee, or admin)
router.get('/:id', authRequired, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    if (!canAccessMeeting(req.user, meeting)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(meeting);
  } catch (err) {
    console.error('Failed to fetch meeting', err);
    res.status(500).json({ error: 'Failed to fetch meeting' });
  }
});

// Track mentor session usage (per-minute billing with grace)
router.post('/:id/session', authRequired, async (req, res) => {
  const { seconds, finalize, startedAt, endedAt } = req.body || {};
  const finalizeSession = Boolean(finalize);
  if (!finalizeSession && (typeof seconds !== 'number' || seconds <= 0)) {
    return res.status(400).json({ error: 'seconds must be a positive number' });
  }
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ error: 'Not found' });
    if (!canAccessMeeting(req.user, meeting)) return res.status(403).json({ error: 'Forbidden' });

    const { graceSeconds, hardStopEnabled } = await getBillingConfig();
    const durationSeconds = Math.max(0, (meeting.durationMinutes || 0) * 60);

    if (!meeting.sessionStartedAt) {
      const maybeStart = startedAt ? new Date(startedAt) : new Date();
      if (!Number.isNaN(maybeStart.getTime())) {
        meeting.sessionStartedAt = maybeStart;
      }
    }

    if (finalizeSession) {
      const endDate = endedAt ? new Date(endedAt) : new Date();
      if (!Number.isNaN(endDate.getTime())) {
        meeting.sessionEndedAt = endDate;
      }

      const elapsedSeconds = computeElapsedSeconds(
        meeting.sessionStartedAt || endDate,
        meeting.sessionEndedAt || endDate,
        meeting.durationMinutes,
        hardStopEnabled
      );
      meeting.totalSessionSeconds = elapsedSeconds;

      const billableSeconds = computeBillableSeconds(elapsedSeconds, graceSeconds);
      const billableMinutes = computeBillableMinutes(billableSeconds);
      const alreadyBilledMinutes = computeBillableMinutes(meeting.billedSeconds || 0);
      const newChargeMinutes = Math.max(0, billableMinutes - alreadyBilledMinutes);

      if (newChargeMinutes > 0) {
        const updatedUser = await User.findOneAndUpdate(
          { _id: meeting.mentorId, 'wallet.mentorSessionCredits': { $gte: newChargeMinutes } },
          { $inc: { 'wallet.mentorSessionCredits': -newChargeMinutes } },
          { new: true }
        ).select('wallet');
        if (!updatedUser) {
          return res.status(402).json({ error: 'Insufficient mentor credits for additional minutes' });
        }
        meeting.creditCharged = true;
      }

      meeting.billedSeconds = Math.max(meeting.billedSeconds || 0, billableSeconds);
      meeting.status = 'COMPLETED';
      await meeting.save();

      return res.json({
        total_session_seconds: meeting.totalSessionSeconds,
        billed_minutes: billableMinutes,
        status: meeting.status,
      });
    }

    if (typeof seconds === 'number' && seconds > 0) {
      const maxAvailable =
        hardStopEnabled && durationSeconds > 0
          ? Math.max(0, durationSeconds - meeting.totalSessionSeconds)
          : Number.POSITIVE_INFINITY;
      const delta = Math.min(maxAvailable, Math.floor(seconds));
      if (hardStopEnabled && durationSeconds > 0 && delta <= 0) {
        return res.status(400).json({ error: 'Session duration already fulfilled' });
      }
      meeting.totalSessionSeconds += delta;
    }

    if (meeting.status === 'SCHEDULED' || meeting.status === 'PENDING' || meeting.status === 'APPROVED') {
      meeting.status = 'IN_PROGRESS';
    }
    await meeting.save();

    res.json({
      total_session_seconds: meeting.totalSessionSeconds,
      status: meeting.status,
    });
  } catch (err) {
    console.error('Failed to record mentor session usage', err);
    res.status(500).json({ error: 'Failed to record session usage' });
  }
});

module.exports = router;
