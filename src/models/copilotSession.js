const mongoose = require('mongoose');

// Generic copilot session that can be driven by multiple clients:
// - Chrome extension overlay (meeting/call tab)
// - Web/mobile console (2nd device)
// Intentionally separate from Meeting (mentor/learner scheduling lifecycle).

const TranscriptChunkSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    ts: { type: Date, default: Date.now },
    // NOTE: the Chrome extension emits granular sources (mic/tab/manual) which are helpful
    // to display in the UI and debug audio pipelines.
    source: {
      type: String,
      enum: ['extension', 'console', 'server', 'mic', 'tab', 'other', 'manual'],
      default: 'extension',
    },
  },
  { _id: false }
);
const TopicEventSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    ts: { type: Date, default: Date.now },
  },
  { _id:  false }
);

const AiMessageSchema = new mongoose.Schema(
  {
    type: { type: String, required: true }, // HELP_ME | EXPLAIN | SUMMARY | etc.
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true },
    ts: { type: Date, default: Date.now },
  },
  { _id: false }
);

const CopilotSessionSchema = new mongoose.Schema(
  {
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, default: 'Copilot Session' },
    scenarioType: {
      type: String,
      enum: ['JOB_INTERVIEW', 'TEAM_MEETING', 'CLIENT_CALL', 'CONSULTING', 'OTHER'],
      default: 'OTHER',
    },
    targetUrl: { type: String, default: '' },
    status: { type: String, enum: ['DRAFT', 'ACTIVE', 'ENDED'], default: 'DRAFT' },
    joinCode: { type: String, index: true },
    metadata: {
      additionalInfo: { type: String, default: '' },
      keywords: { type: [String], default: [] },
      // Optional context fields for interview/grading use-cases.
      resumeText: { type: String, default: '' },
      jobDescriptionText: { type: String, default: '' },

      // Optional linkage to a scheduled interview record from the portal.
      interviewId: { type: String, default: '' },

      // Optional structured context (kept separate so UI can display it cleanly).
      companyName: { type: String, default: '' },
      jobTitle: { type: String, default: '' },
      experienceYears: { type: Number, default: 0 },
      responseStyle: { type: String, default: '' },
    },
    transcript: { type: [TranscriptChunkSchema], default: [] },
    topics: { type: [TopicEventSchema], default: [] },
    aiMessages: { type: [AiMessageSchema], default: [] },
    sessionStartedAt: { type: Date },
    sessionEndedAt: { type: Date },
    totalSessionSeconds: { type: Number, default: 0 },
    billedSeconds: { type: Number, default: 0 },
    creditCharged: { type: Boolean, default: false },
    summaryText: { type: String, default: '' },
    summaryData: { type: mongoose.Schema.Types.Mixed },
    summaryUpdatedAt: { type: Date },
    connectedDevices: {
      type: [{ deviceType: String, socketId: String, lastSeenAt: Date }],
      default: [],
    },
  },
  { timestamps: true }
);

CopilotSessionSchema.index({ ownerUserId: 1, createdAt: -1 });

module.exports =
  mongoose.models.CopilotSession ||
  mongoose.model('CopilotSession', CopilotSessionSchema);
