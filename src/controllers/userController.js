const userService = require('../services/userService');
const { handleServiceError } = require('./controllerUtils');

const listUsers = async (req, res) => {
  try {
    const users = await userService.listUsers();
    const payload = users.map((user) => ({
      id: user._id,
      login_id: user.loginId,
      email: user.email || null,
      name: user.name,
      role: user.role,
      active: user.active,
      wallet: user.wallet || { aiInterviewCredits: 0, mentorSessionCredits: 0 },
      avatar_url: user.avatarUrl || '',
      created_at: user.createdAt
    }));
    res.json(payload);
  } catch (err) {
    handleServiceError(res, err, 'Failed to list users');
  }
};

const updatePassword = async (req, res) => {
  const userId = req.params.id;
  const { newPassword } = req.body || {};
  if (!newPassword) {
    return res.status(400).json({ error: 'newPassword required' });
  }

  try {
    await userService.updatePassword(userId, newPassword);
    res.json({ message: 'Password updated' });
  } catch (err) {
    handleServiceError(res, err, 'Failed to update password');
  }
};

const updateStatus = async (req, res) => {
  const userId = req.params.id;
  const { active } = req.body || {};
  if (typeof active !== 'boolean') {
    return res.status(400).json({ error: 'active must be boolean' });
  }

  try {
    const user = await userService.updateActive(userId, active);
    res.json({
      id: user._id,
      active: user.active,
    });
  } catch (err) {
    handleServiceError(res, err, 'Failed to update user status');
  }
};

const deleteUser = async (req, res) => {
  const userId = req.params.id;
  try {
    await userService.deleteUser(userId);
    res.json({ message: 'User deleted' });
  } catch (err) {
    handleServiceError(res, err, 'Failed to delete user');
  }
};

module.exports = {
  listUsers,
  updatePassword,
  updateStatus,
  deleteUser,
};
