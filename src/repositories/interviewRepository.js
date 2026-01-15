const Interview = require('../models/interview');

const findIdsByUserId = async (userId) => {
  const interviews = await Interview.find({ userId }).select('_id');
  return interviews.map((entry) => entry._id);
};

const deleteByUserId = (userId) => Interview.deleteMany({ userId });

module.exports = {
  findIdsByUserId,
  deleteByUserId,
};
