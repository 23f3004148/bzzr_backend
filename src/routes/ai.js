const express = require('express');
const { authRequired } = require('../middleware/auth');
const aiController = require('../controllers/aiController');

const router = express.Router();

router.post('/generate', authRequired, aiController.generateResponse);
router.get('/stream', aiController.streamResponse);

module.exports = router;
