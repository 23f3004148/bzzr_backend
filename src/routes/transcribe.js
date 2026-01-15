const express = require('express');
const { authRequired } = require('../middleware/auth');
const { transcribeAudio } = require('../services/deepgram');

const router = express.Router();

// Accept any audio/* content-type and forward the same MIME type to Deepgram
router.post(
  '/',
  authRequired,
  require('express').raw({ type: 'audio/*', limit: '25mb' }),
  async (req, res) => {
    try {
      const contentType = req.headers['content-type'];
      const result = await transcribeAudio(req.body, contentType);
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Transcription failed', detail: err.message });
    }
  }
);

module.exports = router;
