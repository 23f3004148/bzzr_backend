const express = require('express');
const multer = require('multer');
const { authRequired } = require('../middleware/auth');
const resumeController = require('../controllers/resumeController');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

router.use(authRequired);

router.get('/', resumeController.listResumes);
router.post('/', resumeController.createResume);
router.post('/upload', upload.single('file'), resumeController.uploadResume);
router.put('/:id', resumeController.updateResume);
router.delete('/:id', resumeController.deleteResume);

module.exports = router;
