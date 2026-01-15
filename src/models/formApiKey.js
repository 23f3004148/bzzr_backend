const mongoose = require('mongoose');

const formApiKeySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    description: { type: String },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('FormApiKey', formApiKeySchema);
