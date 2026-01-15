const express = require('express');
const { authRequired } = require('../middleware/auth');
const { getProvider, getSupportContact, getCreditPricing } = require('../controllers/configController');

const router = express.Router();

router.get('/provider', authRequired, getProvider);
router.get('/support-contact', getSupportContact);
router.get('/pricing', getCreditPricing);

module.exports = router;
