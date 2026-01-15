const mongoose = require('mongoose');

const interviewAnswerSchema = new mongoose.Schema(
  {
    interviewId: { type: mongoose.Schema.Types.ObjectId, ref: 'Interview', required: true },
    question: { type: String, required: true },
    answerText: { type: String, required: true },
    aiFeedback: { type: String },
    score: { type: Number }
  },
  { timestamps: true }
);

interviewAnswerSchema.index({ interviewId: 1 });

module.exports = mongoose.model('InterviewAnswer', interviewAnswerSchema);
