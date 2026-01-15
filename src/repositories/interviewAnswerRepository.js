const InterviewAnswer = require('../models/interviewAnswer');

const deleteByInterviewIds = (interviewIds) => {
  if (!Array.isArray(interviewIds) || interviewIds.length === 0) {
    return Promise.resolve();
  }
  return InterviewAnswer.deleteMany({ interviewId: { $in: interviewIds } });
};

module.exports = {
  deleteByInterviewIds,
};
