const express = require('express');
const { authRequired } = require('../middleware/auth');
const { callAI } = require('../services/aiProvider');
const Interview = require('../models/interview');
const InterviewAnswer = require('../models/interviewAnswer');
const User = require('../models/user');
const {
  getBillingConfig,
  computeElapsedSeconds,
  computeBillableSeconds,
  computeBillableMinutes,
} = require('../utils/sessionBilling');

const router = express.Router();
const INTERVIEW_GRACE_MINUTES = 10;

const toInterviewResponse = (interview, includeUserLogin = false) => {
  const userId =
    interview.userId && interview.userId._id ? interview.userId._id : interview.userId;
  const userIdString = userId && userId.toString ? userId.toString() : userId;
  const payload = {
      id: interview._id,
      user_id: userIdString,
      title: interview.title,
      job_description: interview.jobDescription,
      resume_text: interview.resumeText,
      meeting_url: interview.meetingUrl || '',
      keywords: Array.isArray(interview.keywords) ? interview.keywords : [],
      additional_info: interview.additionalInfo || '',
      response_style: interview.responseStyle || 'Simple Professional English',
      max_lines: interview.maxLines ?? 30,
      examples: interview.examples || [],
      scheduled_at: interview.scheduledAt,
      duration_minutes: interview.durationMinutes,
      expires_at: interview.expiresAt,
      session_seconds_used: interview.totalSessionSeconds,
      session_started_at: interview.sessionStartedAt,
      session_ended_at: interview.sessionEndedAt,
      summary_text: interview.summaryText || '',
      summary_data: interview.summaryData || null,
      summary_topics: Array.isArray(interview.summaryTopics) ? interview.summaryTopics : [],
      summary_updated_at: interview.summaryUpdatedAt || null,
      status: interview.status,
      created_at: interview.createdAt,
      updated_at: interview.updatedAt
    };
  payload.experience_years = interview.experienceYears;
  payload.experienceYears = interview.experienceYears;
  payload.meetingUrl = interview.meetingUrl || '';
  payload.additionalInfo = interview.additionalInfo || '';
  payload.expiresAt = interview.expiresAt;
  if (includeUserLogin && interview.userId && interview.userId.loginId) {
    payload.user_login_id = interview.userId.loginId;
  }
  return payload;
};

const toAnswerResponse = answer => ({
  id: answer._id,
  interview_id: answer.interviewId,
  question: answer.question,
  answer_text: answer.answerText,
  ai_feedback: answer.aiFeedback,
  score: answer.score,
  created_at: answer.createdAt,
  updated_at: answer.updatedAt
});

const cleanExamples = (examples) => {
  if (!Array.isArray(examples)) return [];
  return examples
    .map((ex) => ({
      question: (ex?.question || '').trim(),
      answer: (ex?.answer || '').trim(),
    }))
    .filter((ex) => ex.question || ex.answer);
};

const normalizeKeywords = (list) => {
  if (!Array.isArray(list)) return [];
  return list
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .slice(0, 50);
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

router.get('/', authRequired, async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const interviews = await Interview.find()
        .sort({ createdAt: -1 })
        .populate('userId', 'loginId')
        .lean();
      return res.json(interviews.map((i) => toInterviewResponse(i, true)));
    }

    const interviews = await Interview.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .lean();
    return res.json(interviews.map((i) => toInterviewResponse(i)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch interviews' });
  }
});

router.get('/:id', authRequired, async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id).populate('userId', 'loginId');
    if (!interview) return res.status(404).json({ error: 'Not found' });

    if (req.user.role !== 'admin' && interview.userId?.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const answers = await InterviewAnswer.find({ interviewId: interview._id }).sort({
      createdAt: 1
    });

    res.json({
      ...toInterviewResponse(interview, req.user.role === 'admin'),
      answers: answers.map(toAnswerResponse)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch interview' });
  }
});

router.post('/', authRequired, async (req, res) => {
  const {
    title,
    jobDescription,
    resumeText,
    scheduledAt,
    durationMinutes,
    experienceYears,
    responseStyle,
    maxLines,
    examples,
    meetingUrl,
    meeting_url,
    keywords,
    additionalInfo,
    additional_info,
  } = req.body || {};

  if (!title || !scheduledAt || !durationMinutes || !jobDescription || !resumeText) {
    return res.status(400).json({ error: 'title, scheduledAt, durationMinutes, jobDescription, resumeText are required' });
  }
  if (experienceYears === undefined || experienceYears === null || Number.isNaN(Number(experienceYears))) {
    return res.status(400).json({ error: 'experienceYears is required and must be a number' });
  }

  const dt = new Date(scheduledAt);
  if (Number.isNaN(dt.getTime())) {
    return res.status(400).json({ error: 'Invalid scheduledAt', message: 'Invalid scheduledAt' });
  }
  const durationValue = Number(durationMinutes);
  if (!Number.isFinite(durationValue) || durationValue < 10 || durationValue > 120) {
    return res.status(400).json({ error: 'durationMinutes must be between 10 and 120' });
  }

  try {
    const expiresAt = new Date(
      dt.getTime() + (durationValue + INTERVIEW_GRACE_MINUTES) * 60 * 1000
    );

    const interview = await Interview.create({
      userId: req.user.id,
      title: String(title).trim(),
      jobDescription: String(jobDescription).trim(),
      resumeText: String(resumeText).trim(),
      meetingUrl: String(meetingUrl || meeting_url || '').trim(),
      keywords: normalizeKeywords(keywords),
      additionalInfo: String(additionalInfo || additional_info || '').trim(),
      scheduledAt: dt,
      durationMinutes: durationValue,
      expiresAt,
      experienceYears: Number(experienceYears),
      responseStyle: (responseStyle || 'Simple Professional English').trim(),
      maxLines: Number.isFinite(Number(maxLines)) ? Number(maxLines) : 30,
      examples: cleanExamples(examples),
      status: 'SCHEDULED',
      creditCharged: false,
      creditRefunded: false,
      billedSeconds: 0,
      totalSessionSeconds: 0
    });
    res.status(201).json(toInterviewResponse(interview));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create interview' });
  }
});

router.put('/:id', authRequired, async (req, res) => {
  const {
    title,
    jobDescription,
    resumeText,
    scheduledAt,
    durationMinutes,
    status,
    experienceYears,
    responseStyle,
    maxLines,
    examples,
    meetingUrl,
    meeting_url,
    keywords,
    additionalInfo,
    additional_info,
  } = req.body || {};
  let scheduledAtDate;
  let durationValue;
  if (scheduledAt) {
    scheduledAtDate = new Date(scheduledAt);
    if (Number.isNaN(scheduledAtDate.getTime())) {
      return res.status(400).json({ error: 'Invalid scheduledAt', message: 'Invalid scheduledAt' });
    }
  }
  if (durationMinutes !== undefined) {
    durationValue = Number(durationMinutes);
    if (!Number.isFinite(durationValue) || durationValue < 10 || durationValue > 120) {
      return res.status(400).json({ error: 'durationMinutes must be between 10 and 120' });
    }
  }

  try {
    const interview = await Interview.findById(req.params.id);
    if (!interview) return res.status(404).json({ error: 'Not found' });

    const isAdmin = req.user.role === 'admin';
    const isOwner = interview.userId.toString() === req.user.id;
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (isAdmin) {
      if (status) interview.status = status;
      if (title) interview.title = title;
      if (jobDescription !== undefined) interview.jobDescription = jobDescription;
      if (resumeText !== undefined) interview.resumeText = resumeText;
      if (meetingUrl !== undefined || meeting_url !== undefined) {
        interview.meetingUrl = String(meetingUrl || meeting_url || '').trim();
      }
      if (keywords !== undefined) interview.keywords = normalizeKeywords(keywords);
      if (additionalInfo !== undefined || additional_info !== undefined) {
        interview.additionalInfo = String(additionalInfo || additional_info || '').trim();
      }
      if (scheduledAtDate) interview.scheduledAt = scheduledAtDate;
      if (durationValue !== undefined) interview.durationMinutes = durationValue;
      if (experienceYears !== undefined) interview.experienceYears = Number(experienceYears);
      if (responseStyle !== undefined) interview.responseStyle = responseStyle;
      if (maxLines !== undefined && Number.isFinite(Number(maxLines))) {
        interview.maxLines = Number(maxLines);
      }
      if (examples !== undefined) {
        interview.examples = cleanExamples(examples);
      }
    } else {
      if (['IN_PROGRESS', 'COMPLETED'].includes(interview.status)) {
        return res.status(400).json({ error: 'Cannot edit an interview once it has started or completed' });
      }

      if (title) interview.title = title;
      if (jobDescription !== undefined) interview.jobDescription = jobDescription;
      if (resumeText !== undefined) interview.resumeText = resumeText;
      if (meetingUrl !== undefined || meeting_url !== undefined) {
        interview.meetingUrl = String(meetingUrl || meeting_url || '').trim();
      }
      if (keywords !== undefined) interview.keywords = normalizeKeywords(keywords);
      if (additionalInfo !== undefined || additional_info !== undefined) {
        interview.additionalInfo = String(additionalInfo || additional_info || '').trim();
      }
      if (scheduledAtDate) interview.scheduledAt = scheduledAtDate;
      if (durationValue !== undefined) interview.durationMinutes = durationValue;
      if (experienceYears !== undefined) interview.experienceYears = Number(experienceYears);
      if (responseStyle !== undefined) interview.responseStyle = responseStyle;
      if (maxLines !== undefined && Number.isFinite(Number(maxLines))) {
        interview.maxLines = Number(maxLines);
      }
      if (examples !== undefined) {
        interview.examples = cleanExamples(examples);
      }
    }

    if (scheduledAtDate || durationValue !== undefined) {
      const baseDate = interview.scheduledAt;
      const duration = durationValue !== undefined ? durationValue : interview.durationMinutes;
      interview.expiresAt = new Date(
        baseDate.getTime() + (duration + INTERVIEW_GRACE_MINUTES) * 60 * 1000
      );
    }

    await interview.save();
    const populated = await Interview.findById(interview._id).populate('userId', 'loginId');
    res.json(toInterviewResponse(populated, req.user.role === 'admin'));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update interview' });
  }
});

  router.post('/:id/start', authRequired, async (req, res) => {
    try {
      const interview = await Interview.findById(req.params.id);
      if (!interview) return res.status(404).json({ error: 'Not found' });

      // Semantics:
      // - EXPIRED should mean "never used".
      // - If the interview has any recorded usage, it should be treated as COMPLETED
      //   (even if the user ended early and never reached full duration).
      if (interview.expiresAt && Date.now() > new Date(interview.expiresAt).getTime() && interview.status !== 'COMPLETED') {
        const usedSeconds = Number(interview.totalSessionSeconds || 0);
        if (Number.isFinite(usedSeconds) && usedSeconds > 0) {
          interview.status = 'COMPLETED';
          await interview.save();
          return res.status(400).json({ error: 'Interview already completed' });
        }
        interview.status = 'EXPIRED';
        await interview.save();
        return res.status(400).json({ error: 'Interview expired' });
      }

    const durationSeconds = Math.max(0, (interview.durationMinutes || 0) * 60);
    const scheduledMs = interview.scheduledAt ? new Date(interview.scheduledAt).getTime() : null;
    const windowStart = scheduledMs !== null ? scheduledMs - 10 * 60 * 1000 : null;
    if (windowStart !== null && Date.now() < windowStart) {
      return res.status(400).json({ error: 'Can only start within 10 minutes of the scheduled time' });
    }

    if (req.user.role !== 'admin' && interview.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (interview.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Interview already completed' });
    }
    if (interview.status === 'EXPIRED') {
      return res.status(400).json({ error: 'Interview expired' });
    }

    if (durationSeconds > 0 && interview.totalSessionSeconds >= durationSeconds) {
      return res.status(400).json({ error: 'Interview duration already spent' });
    }

    interview.status = 'IN_PROGRESS';
    if (!interview.sessionStartedAt) {
      interview.sessionStartedAt = new Date();
    }
    interview.sessionEndedAt = undefined;
    await interview.save();

    const populated = await Interview.findById(interview._id).populate('userId', 'loginId');
    res.json(toInterviewResponse(populated, req.user.role === 'admin'));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start interview' });
  }
});

router.post('/:id/session', authRequired, async (req, res) => {
  const { seconds, finalize, startedAt, endedAt } = req.body || {};
  const finalizeSession = Boolean(finalize);
  if (!finalizeSession && (typeof seconds !== 'number' || seconds <= 0)) {
    return res.status(400).json({ error: 'seconds must be a positive number' });
  }

  try {
    const interview = await Interview.findById(req.params.id);
    if (!interview) return res.status(404).json({ error: 'Not found' });

    if (req.user.role !== 'admin' && interview.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { graceSeconds, hardStopEnabled } = await getBillingConfig();
    const durationSeconds = Math.max(0, (interview.durationMinutes || 0) * 60);

    if (!interview.sessionStartedAt) {
      const maybeStart = startedAt ? new Date(startedAt) : new Date();
      if (!Number.isNaN(maybeStart.getTime())) {
        interview.sessionStartedAt = maybeStart;
      }
    }

    if (finalizeSession) {
      const endDate = endedAt ? new Date(endedAt) : new Date();
      if (!Number.isNaN(endDate.getTime())) {
        interview.sessionEndedAt = endDate;
      }

      const elapsedSeconds = computeElapsedSeconds(
        interview.sessionStartedAt || endDate,
        interview.sessionEndedAt || endDate,
        interview.durationMinutes,
        hardStopEnabled
      );
      interview.totalSessionSeconds = elapsedSeconds;

      const billableSeconds = computeBillableSeconds(elapsedSeconds, graceSeconds);
      const billableMinutes = computeBillableMinutes(billableSeconds);
      const alreadyBilledMinutes = computeBillableMinutes(interview.billedSeconds || 0);
      const newChargeMinutes = Math.max(0, billableMinutes - alreadyBilledMinutes);

      if (newChargeMinutes > 0) {
        const updatedUser = await User.findOneAndUpdate(
          { _id: req.user.id, 'wallet.aiInterviewCredits': { $gte: newChargeMinutes } },
          { $inc: { 'wallet.aiInterviewCredits': -newChargeMinutes } },
          { new: true }
        ).select('wallet');
        if (!updatedUser) {
          return res.status(402).json({ error: 'Insufficient AI credits for additional minutes' });
        }
        interview.creditCharged = true;
      }

      interview.billedSeconds = Math.max(interview.billedSeconds || 0, billableSeconds);
      interview.status = 'COMPLETED';
      await interview.save();

      return res.json({
        total_session_seconds: interview.totalSessionSeconds,
        billed_minutes: billableMinutes,
        status: interview.status,
      });
    }

    if (typeof seconds === 'number' && seconds > 0) {
      const maxAvailable =
        hardStopEnabled && durationSeconds > 0
          ? Math.max(0, durationSeconds - interview.totalSessionSeconds)
          : Number.POSITIVE_INFINITY;
      const delta = Math.min(maxAvailable, Math.floor(seconds));
      if (hardStopEnabled && durationSeconds > 0 && delta <= 0) {
        return res.status(400).json({ error: 'Session duration already fulfilled' });
      }
      interview.totalSessionSeconds += delta;
    }

    if (interview.status === 'SCHEDULED' || interview.status === 'PENDING' || interview.status === 'APPROVED') {
      interview.status = 'IN_PROGRESS';
    }
    await interview.save();

    res.json({
      total_session_seconds: interview.totalSessionSeconds,
      status: interview.status,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to record session usage' });
  }
});

router.post('/:id/answers', authRequired, async (req, res) => {
  const { question, answerText, provider } = req.body;
  if (!question || !answerText) {
    return res.status(400).json({ error: 'question and answerText required' });
  }

  try {
    const interview = await Interview.findById(req.params.id);
    if (!interview) return res.status(404).json({ error: 'Not found' });

    if (req.user.role !== 'admin' && interview.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!['SCHEDULED', 'PENDING', 'APPROVED', 'IN_PROGRESS'].includes(interview.status)) {
      return res.status(400).json({ error: 'Interview not scheduled or active' });
    }
    if (interview.status !== 'IN_PROGRESS') {
      interview.status = 'IN_PROGRESS';
      await interview.save();
    }

    const systemMsg = {
      role: 'system',
      content: 'You are an interview evaluator. Give constructive feedback and a score 0-10.'
    };
    const userMsg = {
      role: 'user',
      content: `Question: ${question}\nAnswer: ${answerText}`
    };

    const aiFeedback = await callAI({ provider, messages: [systemMsg, userMsg] });
    const answer = await InterviewAnswer.create({
      interviewId: interview._id,
      question,
      answerText,
      aiFeedback
    });

    res.status(201).json(toAnswerResponse(answer));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save answer' });
  }
});

// GET /api/interviews/:id/answers - list answers for download/export
router.get('/:id/answers', authRequired, async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id);
    if (!interview) return res.status(404).json({ error: 'Not found' });

    if (req.user.role !== 'admin' && interview.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const answers = await InterviewAnswer.find({ interviewId: interview._id }).sort({ createdAt: 1 });
    return res.json({
      interviewId: interview._id,
      answers: answers.map(toAnswerResponse),
    });
  } catch (err) {
    console.error('list answers error', err);
    return res.status(500).json({ error: 'Failed to load answers' });
  }
});

// POST /api/interviews/:id/summary - generate and store a summary
router.post('/:id/summary', authRequired, async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id);
    if (!interview) return res.status(404).json({ error: 'Not found' });

    if (req.user.role !== 'admin' && interview.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const answers = await InterviewAnswer.find({ interviewId: interview._id }).sort({ createdAt: 1 });
    const transcript = answers
      .map((a) => `Q: ${a.question}\nA: ${a.answerText}`)
      .join('\n\n')
      .trim();
    if (!transcript) {
      return res.status(400).json({ error: 'No interview answers found to summarize' });
    }

    const systemMsg = {
      role: 'system',
      content:
        'You are a session summarizer. Return JSON only with keys: summary (string), topics (array), strengths (array), gaps (array), next_steps (array).',
    };
    const userMsg = {
      role: 'user',
      content: `Summarize this interview session:\n${transcript}`,
    };

    const output = await callAI({ provider: req.body?.provider, messages: [systemMsg, userMsg] });
    const summaryJson = parseSummaryJson(output);
    const summaryTopics = normalizeSummaryList(summaryJson?.topics || summaryJson?.topic || []);

    interview.summaryText = summaryJson?.summary ? String(summaryJson.summary) : String(output || '');
    interview.summaryData = summaryJson || undefined;
    interview.summaryTopics = summaryTopics;
    interview.summaryUpdatedAt = new Date();
    await interview.save();

    return res.json({
      summaryText: interview.summaryText,
      summaryData: interview.summaryData,
      summaryTopics: interview.summaryTopics,
      summaryUpdatedAt: interview.summaryUpdatedAt,
    });
  } catch (err) {
    console.error('generate interview summary error', err);
    return res.status(500).json({ error: 'Failed to generate summary' });
  }
});

router.delete('/:id', authRequired, async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id);
    if (!interview) return res.status(404).json({ error: 'Not found' });

    if (req.user.role !== 'admin' && interview.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await InterviewAnswer.deleteMany({ interviewId: interview._id });
    await interview.deleteOne();
    res.json({ message: 'Interview deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete interview' });
  }
});

module.exports = router;
