const express = require('express');
const { authRequired, adminOnly } = require('../middleware/auth');
const { listUsers, updatePassword, updateStatus, deleteUser } = require('../controllers/userController');

const router = express.Router();

router.get('/', authRequired, adminOnly, listUsers);
router.put('/:id/password', authRequired, adminOnly, updatePassword);
router.patch('/:id/status', authRequired, adminOnly, updateStatus);
router.delete('/:id', authRequired, adminOnly, deleteUser);

module.exports = router;
