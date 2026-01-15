const mongoose = require('mongoose');

const interviewSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    jobDescription: { type: String },
    resumeText: { type: String },
    meetingUrl: { type: String, default: '' },
    keywords: { type: [String], default: [] },
    additionalInfo: { type: String, default: '' },
    scheduledAt: { type: Date, required: true },
    durationMinutes: { type: Number, required: true },
    expiresAt: { type: Date },
    experienceYears: { type: Number, default: 0 },
    responseStyle: { type: String, default: 'Simple Professional English' },
    maxLines: { type: Number, default: 30 },
    examples: {
      type: [
        {
          question: { type: String, default: '' },
          answer: { type: String, default: '' },
        },
      ],
      default: [],
    },
    status: {
      type: String,
      // Keep legacy statuses for backward compatibility.
      enum: ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'PENDING', 'APPROVED', 'REJECTED'],
      default: 'SCHEDULED'
    },
    sessionStartedAt: { type: Date },
    sessionEndedAt: { type: Date },

    // Track whether an AI credit was charged for this interview
    creditCharged: { type: Boolean, default: false },
    creditRefunded: { type: Boolean, default: false },
    totalSessionSeconds: { type: Number, default: 0 },
    billedSeconds: { type: Number, default: 0 },

    summaryText: { type: String, default: '' },
    summaryData: { type: mongoose.Schema.Types.Mixed },
    summaryTopics: { type: [String], default: [] },
    summaryUpdatedAt: { type: Date }
  },
  { timestamps: true }
);

interviewSchema.index({ userId: 1, createdAt: -1 });
interviewSchema.index({ userId: 1, expiresAt: -1 });

module.exports = mongoose.model('Interview', interviewSchema);
