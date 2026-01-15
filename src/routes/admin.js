const express = require('express');
const { authRequired, adminOnly } = require('../middleware/auth');
const {
  resetCredentials,
  getSettings,
  updateSettings,
  listContactSubmissions,
  deleteContactSubmission,
  createFormKey
} = require('../controllers/adminController');

const router = express.Router();

const resetLimiterState = new Map();
const RESET_WINDOW_MS = 10 * 60 * 1000;
const RESET_MAX_ATTEMPTS = 5;

const resetLimiter = (req, res, next) => {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const recent = (resetLimiterState.get(key) || []).filter((ts) => now - ts < RESET_WINDOW_MS);
  if (recent.length >= RESET_MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many reset attempts. Please wait and try again.' });
  }
  recent.push(now);
  resetLimiterState.set(key, recent);
  next();
};

router.post('/reset-credentials', authRequired, adminOnly, resetLimiter, resetCredentials);
router.get('/settings', authRequired, adminOnly, getSettings);
router.put('/settings', authRequired, adminOnly, updateSettings);
router.get('/contact-submissions', authRequired, adminOnly, listContactSubmissions);
router.delete('/contact-submissions/:id', authRequired, adminOnly, deleteContactSubmission);
router.post('/form-keys', authRequired, adminOnly, createFormKey);

module.exports = router;
