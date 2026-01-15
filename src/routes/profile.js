const express = require('express');
const { authRequired } = require('../middleware/auth');
const controller = require('../controllers/profileController');
const multer = require('multer');
const pdfParse = require('pdf-parse');

const router = express.Router();

// GET /api/profile
router.get('/', authRequired, controller.get);

// PATCH /api/profile
router.patch('/', authRequired, controller.update);

// POST /api/profile/jd/parse - extract text from a PDF or text file for job descriptions
const jdUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

router.post('/jd/parse', authRequired, jdUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const mime = req.file.mimetype || '';
    const name = req.file.originalname || '';
    let text = '';
    const isPdf = mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      const data = await pdfParse(req.file.buffer);
      text = String(data.text || '').trim();
    } else {
      text = String(req.file.buffer.toString('utf8') || '').trim();
    }

    if (!text) return res.status(400).json({ error: 'Could not extract text from file' });

    return res.json({ text });
  } catch (err) {
    console.error('jd parse error', err);
    return res.status(500).json({ error: 'Failed to parse job description' });
  }
});

module.exports = router;
