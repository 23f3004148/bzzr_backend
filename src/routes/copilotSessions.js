const express = require('express');
const { authRequired } = require('../middleware/auth');
const controller = require('../controllers/copilotSessionController');

const router = express.Router();

router.get('/', authRequired, controller.list);
router.post('/', authRequired, controller.create);
router.get('/:id', authRequired, controller.get);
router.patch('/:id', authRequired, controller.update);
router.delete('/:id', authRequired, controller.remove);
router.post('/:id/start', authRequired, controller.start);
router.post('/:id/end', authRequired, controller.end);
router.post('/:id/summary', authRequired, controller.summary);

module.exports = router;
