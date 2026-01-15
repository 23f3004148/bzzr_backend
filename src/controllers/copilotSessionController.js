// backend/src/controllers/copilotSessionController.js

const CopilotSession = require("../models/copilotSession");
const Interview = require("../models/interview");
const User = require("../models/user");
const {
  getBillingConfig,
  computeElapsedSeconds,
  computeBillableSeconds,
  computeBillableMinutes,
} = require('../utils/sessionBilling');
const { summarizeCopilotSession } = require('../utils/copilotSummary');

// -------- helpers --------

const getOwnerUserId = (req) =>
  req.user?.id ||
  req.user?._id ||
  req.user?.userId ||
  req.user?.user_id ||
  null;

const normalizeScenarioType = (v) => {
  if (!v) return "OTHER";

  const raw = String(v).trim();

  const upper = raw.toUpperCase();
  const allowed = [
    "JOB_INTERVIEW",
    "TEAM_MEETING",
    "CLIENT_CALL",
    "CONSULTING",
    "OTHER",
  ];
  if (allowed.includes(upper)) return upper;

  const lower = raw.toLowerCase();

  if (lower === "job_interview") return "JOB_INTERVIEW";
  if (lower === "team_meeting") return "TEAM_MEETING";
  if (lower === "client_meeting") return "CLIENT_CALL";
  if (lower === "client_call") return "CLIENT_CALL";
  if (lower === "consulting") return "CONSULTING";
  if (lower === "hr_interview") return "JOB_INTERVIEW";

  return "OTHER";
};

const generateJoinCode = () =>
  Math.random().toString(16).slice(2, 8).toUpperCase();

// Extract metadata fields from either top-level body or a nested `metadata` object.
// This is used both when creating a session and when updating it.
const extractMetadataFromBody = (body) => {
  const src = (body && typeof body === 'object') ? body : {};
  const nested = (src.metadata && typeof src.metadata === 'object') ? src.metadata : {};

  const pickStr = (key) => {
    if (typeof src[key] === 'string') return src[key];
    if (typeof nested[key] === 'string') return nested[key];
    return undefined;
  };

  const pickNum = (key) => {
    const v = (src[key] !== undefined) ? src[key] : nested[key];
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(v);
    if (Number.isNaN(n)) return undefined;
    return n;
  };

  const pickArr = (key) => {
    if (Array.isArray(src[key])) return src[key];
    if (Array.isArray(nested[key])) return nested[key];
    return undefined;
  };

  const meta = {};

  const keywords = pickArr('keywords');
  if (keywords) {
    meta.keywords = keywords.map((x) => String(x)).filter(Boolean).slice(0, 100);
  }

  const additionalInfo = pickStr('additionalInfo');
  if (additionalInfo !== undefined) meta.additionalInfo = additionalInfo;

  const resumeText = pickStr('resumeText');
  if (resumeText !== undefined) meta.resumeText = resumeText;

  const jobDescriptionText = pickStr('jobDescriptionText');
  if (jobDescriptionText !== undefined) meta.jobDescriptionText = jobDescriptionText;

  const interviewId = pickStr('interviewId');
  if (interviewId !== undefined) meta.interviewId = interviewId;

  const companyName = pickStr('companyName');
  if (companyName !== undefined) meta.companyName = companyName;

  const jobTitle = pickStr('jobTitle');
  if (jobTitle !== undefined) meta.jobTitle = jobTitle;

  const experienceYears = pickNum('experienceYears');
  if (experienceYears !== undefined) meta.experienceYears = experienceYears;

  const responseStyle = pickStr('responseStyle');
  if (responseStyle !== undefined) meta.responseStyle = responseStyle;

  return meta;
};

// -------- controllers --------

exports.list = async (req, res) => {
  try {
    const ownerUserId = getOwnerUserId(req);
    if (!ownerUserId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const sessions = await CopilotSession.find({ ownerUserId })
      .select('-transcript -topics -aiMessages -summaryText -summaryData -connectedDevices')
      .sort({ createdAt: -1 })
      .lean();

    // extension expects a plain array
    return res.json(sessions);
  } catch (err) {
    console.error("copilotSessions.list error:", err);
    return res.status(500).json({ error: "Failed to fetch copilot sessions" });
  }
};

exports.create = async (req, res) => {
  try {
    const ownerUserId = getOwnerUserId(req);
    if (!ownerUserId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { title = "", targetUrl = "" } = req.body || {};
    const scenarioType = normalizeScenarioType(req.body?.scenarioType);

    const meta = extractMetadataFromBody(req.body);

    const session = await CopilotSession.create({
      ownerUserId,
      title,
      targetUrl,
      scenarioType,
      status: "DRAFT",
      ...(Object.keys(meta).length ? { metadata: meta } : {}),
    });

    return res.status(201).json(session);
  } catch (err) {
    console.error("copilotSessions.create error:", err);
    return res.status(500).json({ error: "Failed to create copilot session" });
  }
};

exports.get = async (req, res) => {
  try {
    const ownerUserId = getOwnerUserId(req);
    if (!ownerUserId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const sessionId = req.params.id;
    const session = await CopilotSession.findOne({ _id: sessionId, ownerUserId });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    return res.json(session);
  } catch (err) {
    console.error("copilotSessions.get error:", err);
    return res.status(500).json({ error: "Failed to fetch copilot session" });
  }
};

exports.update = async (req, res) => {
  try {
    const ownerUserId = getOwnerUserId(req);
    if (!ownerUserId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const sessionId = req.params.id;

    const update = {};
    if (typeof req.body?.title === "string") update.title = req.body.title;
    if (typeof req.body?.targetUrl === "string") update.targetUrl = req.body.targetUrl;
    if (req.body?.scenarioType) {
      update.scenarioType = normalizeScenarioType(req.body.scenarioType);
    }

    // Optional metadata updates (used to steer AI answers)
    const meta = extractMetadataFromBody(req.body);
    Object.entries(meta).forEach(([k, v]) => {
      update[`metadata.${k}`] = v;
    });

    const session = await CopilotSession.findOneAndUpdate(
      { _id: sessionId, ownerUserId },
      { $set: update },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    return res.json(session);
  } catch (err) {
    console.error("copilotSessions.update error:", err);
    return res.status(500).json({ error: "Failed to update copilot session" });
  }
};

exports.remove = async (req, res) => {
  try {
    const ownerUserId = getOwnerUserId(req);
    if (!ownerUserId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const sessionId = req.params.id;

    const deleted = await CopilotSession.findOneAndDelete({
      _id: sessionId,
      ownerUserId,
    });

    if (!deleted) {
      return res.status(404).json({ error: "Session not found" });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("copilotSessions.remove error:", err);
    return res.status(500).json({ error: "Failed to delete copilot session" });
  }
};

exports.start = async (req, res) => {
  try {
    const ownerUserId = getOwnerUserId(req);
    if (!ownerUserId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const sessionId = req.params.id;

    const session = await CopilotSession.findOne({
      _id: sessionId,
      ownerUserId,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (!session.joinCode) {
      session.joinCode = generateJoinCode();
    }

    session.status = "ACTIVE";
    if (!session.sessionStartedAt) {
      session.sessionStartedAt = new Date();
    }
    session.sessionEndedAt = undefined;
    await session.save();

    // If this copilot session is linked to a scheduled portal interview,
    // mark that interview as IN_PROGRESS so it doesn't later show up as "Expired".
    const linkedInterviewId = session?.metadata?.interviewId;
    if (linkedInterviewId) {
      try {
        await Interview.updateOne(
          { _id: linkedInterviewId, status: { $ne: 'COMPLETED' } },
          {
            $set: { status: 'IN_PROGRESS' },
            // Mark as "used" immediately on start to prevent expiry/refund jobs
            // from treating it as never-used if the user forgets to click "End".
            $max: { totalSessionSeconds: 1 },
          }
        );
      } catch (e) {
        // Non-fatal: keep copilot session usable even if interview update fails.
        console.warn('Failed to mark linked interview IN_PROGRESS', e?.message || e);
      }
    }

    return res.json({
      sessionId: session._id.toString(),
      joinCode: session.joinCode,
      targetUrl: session.targetUrl,
      title: session.title,
      scenarioType: session.scenarioType,
    });
  } catch (err) {
    console.error("copilotSessions.start error:", err);
    return res.status(500).json({ error: "Failed to start copilot session" });
  }
};

exports.end = async (req, res) => {
  try {
    const ownerUserId = getOwnerUserId(req);
    if (!ownerUserId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const sessionId = req.params.id;

    const session = await CopilotSession.findOne({
      _id: sessionId,
      ownerUserId,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const linkedInterviewId = session?.metadata?.interviewId;
    let linkedInterview = null;
    if (linkedInterviewId) {
      linkedInterview = await Interview.findById(linkedInterviewId).select('durationMinutes status');
    }

    const endDate = new Date();
    if (!session.sessionStartedAt) {
      session.sessionStartedAt = endDate;
    }
    session.sessionEndedAt = endDate;
    session.status = "ENDED";
    session.connectedDevices = [];
    session.joinCode = undefined;

    const { graceSeconds, hardStopEnabled } = await getBillingConfig();
    const durationMinutes = linkedInterview?.durationMinutes || 0;
    const elapsedSeconds = computeElapsedSeconds(
      session.sessionStartedAt,
      session.sessionEndedAt,
      durationMinutes,
      hardStopEnabled
    );
    session.totalSessionSeconds = elapsedSeconds;

    const billableSeconds = computeBillableSeconds(elapsedSeconds, graceSeconds);
    const billableMinutes = computeBillableMinutes(billableSeconds);
    const alreadyBilledMinutes = computeBillableMinutes(session.billedSeconds || 0);
    const newChargeMinutes = Math.max(0, billableMinutes - alreadyBilledMinutes);

    if (newChargeMinutes > 0) {
      const updatedUser = await User.findOneAndUpdate(
        { _id: ownerUserId, 'wallet.aiInterviewCredits': { $gte: newChargeMinutes } },
        { $inc: { 'wallet.aiInterviewCredits': -newChargeMinutes } },
        { new: true }
      ).select('wallet');
      if (!updatedUser) {
        await session.save();
        return res.status(402).json({ error: "Insufficient AI credits for this session" });
      }
      session.creditCharged = true;
    }

    session.billedSeconds = Math.max(session.billedSeconds || 0, billableSeconds);

    if (!session.summaryUpdatedAt) {
      try {
        const summaryResult = await summarizeCopilotSession(session);
        if (summaryResult) {
          session.summaryText = summaryResult.summaryText;
          session.summaryData = summaryResult.summaryData;
          session.summaryUpdatedAt = new Date();
        }
      } catch (err) {
        console.warn('Failed to auto-generate copilot summary', err?.message || err);
      }
    }
    await session.save();

    // If this copilot session is linked to a scheduled portal interview,
    // mark that interview as COMPLETED (used) so it never shows up as "Expired".
    if (linkedInterviewId) {
      try {
        await Interview.updateOne(
          { _id: linkedInterviewId, status: { $ne: "COMPLETED" } },
          {
            $set: { status: "COMPLETED" },
            // Ensure sessionSecondsUsed isn't 0 so the UI can reliably treat it as used.
            $max: { totalSessionSeconds: Math.max(1, elapsedSeconds) },
          }
        );
      } catch (e) {
        // Non-fatal: keep copilot session ended even if interview update fails.
        console.warn("Failed to mark linked interview COMPLETED", e?.message || e);
      }
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("copilotSessions.end error:", err);
    return res.status(500).json({ error: "Failed to end copilot session" });
  }
};

exports.summary = async (req, res) => {
  try {
    const ownerUserId = getOwnerUserId(req);
    if (!ownerUserId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const sessionId = req.params.id;
    const session = await CopilotSession.findOne({
      _id: sessionId,
      ownerUserId,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const summaryResult = await summarizeCopilotSession(session, req.body?.provider);
    if (!summaryResult) {
      return res.status(400).json({ error: "No transcript available to summarize" });
    }

    session.summaryText = summaryResult.summaryText;
    session.summaryData = summaryResult.summaryData;
    session.summaryUpdatedAt = new Date();
    await session.save();

    return res.json({
      summaryText: session.summaryText,
      summaryData: session.summaryData,
      summaryTopics: summaryResult.summaryTopics,
      summaryUpdatedAt: session.summaryUpdatedAt,
    });
  } catch (err) {
    console.error("copilotSessions.summary error:", err);
    return res.status(500).json({ error: "Failed to generate session summary" });
  }
};
