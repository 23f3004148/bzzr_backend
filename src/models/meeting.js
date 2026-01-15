const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema(
  {
    // "mentorId" is the session creator/host (we keep the field name for compatibility)
    mentorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Session topic / technology
    technology: { type: String, required: true },

    // Optional display name for the attendee (legacy field name)
    studentName: { type: String, default: '' },

    // The first user who joins via meetingKey becomes the attendee.
    attendeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    attendeeName: { type: String, default: '' },

    scheduledAt: { type: Date, required: true },
  durationMinutes: { type: Number, default: 60, min: 10, max: 120 },
    expiresAt: { type: Date },

    meetingKey: { type: String, required: true, unique: true, index: true },

    status: {
      type: String,
      // Keep legacy statuses for backward compatibility, but new flow uses SCHEDULED.
      enum: [
        'SCHEDULED',
        'IN_PROGRESS',
        'COMPLETED',
        'EXPIRED',
        'PENDING',
        'APPROVED',
        'REJECTED',
      ],
      default: 'SCHEDULED',
    },

    mentorJoinedAt: { type: Date },
    attendeeJoinedAt: { type: Date },
    sessionStartedAt: { type: Date },
    sessionEndedAt: { type: Date },

    // Credit tracking for "mentor session" credits.
    creditCharged: { type: Boolean, default: false },
    creditRefunded: { type: Boolean, default: false },

    totalSessionSeconds: { type: Number, default: 0 },
    billedSeconds: { type: Number, default: 0 },

    meetingUrl: { type: String, default: '' },

    transcript: { type: String, default: '' },

    summaryText: { type: String, default: '' },
    summaryData: { type: mongoose.Schema.Types.Mixed },
    summaryTopics: { type: [String], default: [] },
    summaryUpdatedAt: { type: Date },
  },
  { timestamps: true }
);

meetingSchema.index({ mentorId: 1, scheduledAt: -1 });
meetingSchema.index({ attendeeId: 1, scheduledAt: -1 });
meetingSchema.index({ meetingKey: 1 });
meetingSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('Meeting', meetingSchema);
