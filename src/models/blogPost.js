const mongoose = require('mongoose');

const blogPostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    heroImage: { type: String, default: '' }, // URL to display in cards
    content: { type: String, default: '' },
    bullets: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['featured', 'latest', 'standard'],
      default: 'standard'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('BlogPost', blogPostSchema);
