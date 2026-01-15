// backend/src/controllers/profileController.js

const User = require('../models/user');

const normalizeKeywords = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .slice(0, 100);
};

exports.get = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    return res.json({
      id: user._id,
      loginId: user.loginId,
      name: user.name,
      role: user.role,
      active: user.active,
      resumeText: user.resumeText || '',
      keywords: Array.isArray(user.keywords) ? user.keywords : [],
    });
  } catch (err) {
    console.error('profile.get error:', err);
    return res.status(500).json({ error: 'Failed to load profile' });
  }
};

exports.update = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const update = {};
    if (typeof req.body?.resumeText === 'string') {
      update.resumeText = req.body.resumeText;
    }
    if (Array.isArray(req.body?.keywords)) {
      update.keywords = normalizeKeywords(req.body.keywords);
    }
    if (typeof req.body?.name === 'string') {
      const trimmed = req.body.name.trim();
      if (trimmed) update.name = trimmed;
    }

    const user = await User.findByIdAndUpdate(userId, { $set: update }, { new: true }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    return res.json({
      id: user._id,
      loginId: user.loginId,
      name: user.name,
      role: user.role,
      active: user.active,
      resumeText: user.resumeText || '',
      keywords: Array.isArray(user.keywords) ? user.keywords : [],
    });
  } catch (err) {
    console.error('profile.update error:', err);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
};
