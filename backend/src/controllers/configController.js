const adminService = require('../services/adminService');
const { handleServiceError } = require('./controllerUtils');

const getProvider = async (req, res) => {
  try {
    const defaultProvider = await adminService.getDefaultProvider();
    res.json({ defaultProvider });
  } catch (err) {
    handleServiceError(res, err, 'Failed to fetch provider config');
  }
};

const getSupportContact = async (req, res) => {
  try {
    const supportPhone = await adminService.getSupportContact();
    res.json({ supportPhone });
  } catch (err) {
    handleServiceError(res, err, 'Failed to fetch support contact');
  }
};

const getCreditPricing = async (req, res) => {
  try {
    const pricing = await adminService.getCreditPricing();
    res.json(pricing);
  } catch (err) {
    handleServiceError(res, err, 'Failed to fetch credit pricing');
  }
};

module.exports = {
  getProvider,
  getSupportContact,
  getCreditPricing,
};
