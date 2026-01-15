const ContactSubmission = require('../models/contactSubmission');

const listAll = () => ContactSubmission.find().sort({ createdAt: -1 });
const deleteById = (id) => ContactSubmission.findByIdAndDelete(id);

module.exports = {
  listAll,
  deleteById,
};
