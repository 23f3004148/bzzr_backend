const express = require('express');
const ContactSubmission = require('../models/contactSubmission');

const router = express.Router();

router.post('/', async (req, res) => {
  const { name, email, subject, message } = req.body || {};
  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const submission = await ContactSubmission.create({
      name: name.trim(),
      email: email.trim(),
      subject: subject.trim(),
      message: message.trim(),
    });
    res.status(201).json({
      id: submission._id,
      name: submission.name,
      email: submission.email,
      subject: submission.subject,
      message: submission.message,
      created_at: submission.createdAt,
    });
  } catch (err) {
    console.error('Failed to save contact submission', err);
    res.status(500).json({ error: 'Failed to submit message' });
  }
});

module.exports = router;
