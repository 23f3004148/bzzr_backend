const adminService = require('../services/adminService');
const { handleServiceError } = require('./controllerUtils');

const resetCredentials = async (req, res) => {
  const { loginId, password, name, resetKey } = req.body || {};
  if (!loginId || !password) {
    return res.status(400).json({ error: 'loginId and password are required' });
  }

  try {
    await adminService.resetCredentials({ loginId, password, name, resetKey });
    res.json({ message: 'Admin credentials updated' });
  } catch (err) {
    handleServiceError(res, err, 'Failed to reset admin credentials');
  }
};

const getSettings = async (req, res) => {
  try {
    const settings = await adminService.getSettings();
    res.json(settings);
  } catch (err) {
    handleServiceError(res, err, 'Failed to fetch settings');
  }
};

const updateSettings = async (req, res) => {
  try {
    const updated = await adminService.updateSettings(req.body || {});
    res.json({
      default_provider: updated.defaultProvider,
      ai_credit_price: updated.aiCreditPrice,
      mentor_credit_price: updated.mentorCreditPrice,
      min_credit_purchase: updated.minCreditPurchase,
      has_razorpay_key: Boolean(updated.razorpayKeyId && updated.razorpayKeySecret),
    });
  } catch (err) {
    handleServiceError(res, err, 'Failed to update settings');
  }
};

const listContactSubmissions = async (req, res) => {
  try {
    const entries = await adminService.listContactSubmissions();
    res.json(
      entries.map((entry) => ({
        id: entry._id,
        name: entry.name,
        email: entry.email,
        subject: entry.subject,
        message: entry.message,
        created_at: entry.createdAt
      }))
    );
  } catch (err) {
    handleServiceError(res, err, 'Failed to load contact submissions');
  }
};

const deleteContactSubmission = async (req, res) => {
  const { id } = req.params;
  try {
    const deleted = await adminService.deleteContactSubmission(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    res.json({ message: 'Submission deleted' });
  } catch (err) {
    handleServiceError(res, err, 'Failed to delete contact submission');
  }
};

const createFormKey = async (req, res) => {
  const { description } = req.body || {};
  try {
    const formKey = await adminService.createFormKey(description);
    res.status(201).json({
      id: formKey._id,
      key: formKey.key,
      description: formKey.description,
      active: formKey.active,
      created_at: formKey.createdAt
    });
  } catch (err) {
    handleServiceError(res, err, 'Failed to create form key');
  }
};

module.exports = {
  resetCredentials,
  getSettings,
  updateSettings,
  listContactSubmissions,
  deleteContactSubmission,
  createFormKey,
};
