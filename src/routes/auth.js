const express = require('express');
const { authRequired, adminOnly } = require('../middleware/auth');
const {
  login,
  loginWithGoogle,
  getCurrentUser,
  createUser,
  register,
  forgotPassword,
  resetPassword,
} = require('../controllers/authController');

const router = express.Router();

router.post('/login', login);
router.post('/google', loginWithGoogle);
router.post('/register', register);
router.get('/me', authRequired, getCurrentUser);
router.post('/admin/create-user', authRequired, adminOnly, createUser);

// Password reset flows
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
