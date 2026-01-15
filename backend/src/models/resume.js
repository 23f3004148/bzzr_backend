const mongoose = require('mongoose');

const resumeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    source: { type: String, enum: ['TEXT', 'PDF'], default: 'TEXT' },
    originalFileName: { type: String, default: '' },
    resumeText: { type: String, required: true },
    aiContext: {
      summary: { type: String, default: '' },
      skills: { type: [String], default: [] },
      extractedAt: { type: Date },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Resume', resumeSchema);
