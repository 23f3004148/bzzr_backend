const jwt = require('jsonwebtoken');
const authService = require('../services/authService');
const userService = require('../services/userService');
const userRepository = require('../repositories/userRepository');
const { handleServiceError } = require('./controllerUtils');
const { sendRegistrationEmail, sendPasswordResetEmail } = require('../services/emailService');
const crypto = require('crypto');
const PasswordResetToken = require('../models/passwordResetToken');
const { OAuth2Client } = require('google-auth-library');
const adminSettingsRepository = require('../repositories/adminSettingsRepository');
const { generateFriendlyLoginId } = require('../services/idService');

const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;

const serializeUser = (user) => ({
  id: user._id,
  loginId: user.loginId,
  email: user.email || null,
  name: user.name,
  role: user.role,
  active: user.active,
  wallet: user.wallet || { aiInterviewCredits: 0, mentorSessionCredits: 0 },
  avatarUrl: user.avatarUrl || '',
  createdAt: user.createdAt,
});

const login = async (req, res) => {
  const { loginId, password } = req.body || {};
  if (!loginId || !password) {
    return res.status(400).json({ error: 'loginId and password required' });
  }

  try {
    const { user, defaultProvider } = await authService.login({ loginId, password });
    const token = jwt.sign(
      { id: user._id.toString(), role: user.role, loginId: user.loginId },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );
    res.json({
      token,
      defaultProvider,
      user: serializeUser(user)
    });
  } catch (err) {
    handleServiceError(res, err, 'Login failed');
  }
};

const getCurrentUser = async (req, res) => {
  try {
    const user = await authService.getUserById(req.user.id);
    res.json(serializeUser(user));
  } catch (err) {
    handleServiceError(res, err, 'Failed to fetch current user');
  }
};

const createUser = async (req, res) => {
  const { loginId, name, password, role } = req.body || {};
  if (!loginId || !name || !password) {
    return res.status(400).json({ error: 'loginId, name, password required' });
  }

  try {
    const user = await userService.createUser({ loginId, name, password, role });
    res.status(201).json({
      id: user._id,
      login_id: user.loginId,
      name: user.name,
      role: user.role
    });
  } catch (err) {
    handleServiceError(res, err, 'Failed to create user');
  }
};

// Public registration (single user dashboard, no mentor/learner split).
// POST /api/auth/register
const register = async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email, password required' });
  }

  try {
    const user = await userService.registerUser({ name, email, password });
    const token = jwt.sign(
      { id: user._id.toString(), role: user.role, loginId: user.loginId },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );
    // Send registration email asynchronously (do not block response)
    try {
      await sendRegistrationEmail(user);
    } catch (err) {
      console.error('Registration email error', err);
    }
    res.status(201).json({
      token,
      user: serializeUser(user),
    });
  } catch (err) {
    handleServiceError(res, err, 'Registration failed');
  }
};

// POST /api/auth/forgot-password
// Expects { email } and sends a password reset link via email if the user exists.
const forgotPassword = async (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: 'email required' });
  }
  const normalized = String(email).trim().toLowerCase();
  try {
    // Find active user by email. Do not reveal existence to avoid enumeration.
    const userRepository = require('../repositories/userRepository');
    const user = await userRepository.findActiveByEmail(normalized).catch(() => null);
    if (user && user.email && user.active !== false) {
      // Remove previous tokens for this user
      await PasswordResetToken.deleteMany({ userId: user._id });
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await PasswordResetToken.create({ userId: user._id, token, expiresAt });
      try {
        await sendPasswordResetEmail(user, token);
      } catch (err) {
        console.error('Failed to send password reset email', err);
      }
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('Forgot password error', err);
    return res.status(500).json({ error: 'Failed to process forgot password' });
  }
};

// POST /api/auth/reset-password
// Expects { userId, token, newPassword } and resets the password if the token is valid.
const resetPassword = async (req, res) => {
  const { userId, token, newPassword } = req.body || {};
  if (!userId || !token || !newPassword) {
    return res.status(400).json({ error: 'userId, token, newPassword required' });
  }
  try {
    const record = await PasswordResetToken.findOne({ userId, token }).lean();
    if (!record) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
      // Expired
      await PasswordResetToken.deleteOne({ _id: record._id });
      return res.status(400).json({ error: 'Token expired' });
    }
    // Reset password
    await userService.updatePassword(userId, newPassword);
    // Delete token record
    await PasswordResetToken.deleteOne({ _id: record._id });
    return res.json({ success: true });
  } catch (err) {
    console.error('Reset password error', err);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
};

// POST /api/auth/google
// Expects { idToken } issued by Google Identity Services. Verifies the token, creates
// a user if one does not exist for the email, and returns a JWT.
const loginWithGoogle = async (req, res) => {
  const { idToken } = req.body || {};

  if (!googleClientId || !googleClient) {
    return res.status(500).json({ error: 'Google login is not configured' });
  }
  if (!idToken) {
    return res.status(400).json({ error: 'idToken required' });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: googleClientId,
    });
    const payload = ticket.getPayload();
    const email = payload?.email?.toLowerCase();
    const emailVerified = payload?.email_verified !== false;
    const name = payload?.name || 'Google User';

    if (!email || !emailVerified) {
      return res.status(400).json({ error: 'Google account does not include a verified email' });
    }

    let user = await userRepository.findByEmail(email);
    if (user && user.active === false) {
      return res.status(403).json({ error: 'Account is disabled' });
    }

    if (!user) {
      const loginId = await generateFriendlyLoginId({ prefixLength: 3 });
      const randomPassword = crypto.randomBytes(24).toString('hex');
      user = await userService.createUser({
        loginId,
        name,
        password: randomPassword,
        email,
        role: 'user',
      });
    }

    const settings = await adminSettingsRepository.getConfig();
    const token = jwt.sign(
      { id: user._id.toString(), role: user.role, loginId: user.loginId },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    return res.json({
      token,
      defaultProvider: settings?.defaultProvider,
      user: serializeUser(user),
    });
  } catch (err) {
    console.error('Google login error', err);
    return res.status(401).json({ error: 'Google login failed' });
  }
};

module.exports = {
  login,
  loginWithGoogle,
  getCurrentUser,
  createUser,
  register,
  forgotPassword,
  resetPassword,
};
