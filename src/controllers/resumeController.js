const Resume = require('../models/resume');

function extractAiContextFromText(text) {
  const raw = String(text || '').replace(/\r/g, '');
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const summary = lines.slice(0, 4).join(' ').slice(0, 360);

  const skillBank = [
    // Web
    'JavaScript', 'TypeScript', 'React', 'Next.js', 'Angular', 'Vue',
    'Node.js', 'Express', 'NestJS', 'HTML', 'CSS', 'Tailwind', 'Sass',
    'GraphQL', 'REST', 'Webpack', 'Vite', 'Redux', 'Zustand',

    // Backend / Data
    'Python', 'Django', 'Flask', 'FastAPI',
    'Java', 'Spring',
    'C#', '.NET',
    'Go', 'Golang',
    'PostgreSQL', 'MySQL', 'SQLite', 'MongoDB', 'Redis',
    'Kafka', 'RabbitMQ',

    // Cloud / DevOps
    'AWS', 'Azure', 'GCP',
    'Docker', 'Kubernetes', 'Terraform',
    'CI/CD', 'GitHub Actions',

    // Product / Process
    'System Design', 'Agile', 'Scrum',
  ];

  const lower = raw.toLowerCase();
  const skills = skillBank
    .filter((s) => lower.includes(s.toLowerCase()))
    .reduce((acc, s) => {
      if (!acc.includes(s)) acc.push(s);
      return acc;
    }, [])
    .slice(0, 30);

  return {
    summary,
    skills,
    extractedAt: new Date(),
  };
}

exports.listResumes = async (req, res) => {
  try {
    const userId = req.user.id;
    const items = await Resume.find({ userId }).sort({ updatedAt: -1, createdAt: -1 });
    return res.json(items);
  } catch (e) {
    console.error('listResumes error:', e);
    return res.status(500).json({ message: 'Failed to list resumes' });
  }
};

exports.createResume = async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, resumeText, source, originalFileName } = req.body || {};

    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: 'Title is required' });
    }
    if (!resumeText || !String(resumeText).trim()) {
      return res.status(400).json({ message: 'Resume text is required' });
    }

    const aiContext = extractAiContextFromText(resumeText);
    const created = await Resume.create({
      userId,
      title: String(title).trim(),
      source: source === 'PDF' ? 'PDF' : 'TEXT',
      originalFileName: originalFileName ? String(originalFileName) : '',
      resumeText: String(resumeText),
      aiContext,
    });

    return res.status(201).json(created);
  } catch (e) {
    console.error('createResume error:', e);
    return res.status(500).json({ message: 'Failed to create resume' });
  }
};

exports.uploadResume = async (req, res) => {
  try {
    const userId = req.user.id;
    const title = (req.body && req.body.title) || 'Uploaded Resume';

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const originalFileName = req.file.originalname || '';
    const mime = req.file.mimetype || '';

    let resumeText = '';
    let source = 'TEXT';

    if (mime === 'application/pdf' || originalFileName.toLowerCase().endsWith('.pdf')) {
      source = 'PDF';
      // Lazy-require to avoid crashing if dependency not installed.
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(req.file.buffer);
      resumeText = String(data.text || '').trim();
    } else {
      resumeText = String(req.file.buffer.toString('utf8') || '').trim();
    }

    if (!resumeText) {
      return res.status(400).json({ message: 'Could not extract text from the uploaded file' });
    }

    const aiContext = extractAiContextFromText(resumeText);
    const created = await Resume.create({
      userId,
      title: String(title).trim() || 'Uploaded Resume',
      source,
      originalFileName,
      resumeText,
      aiContext,
    });

    return res.status(201).json(created);
  } catch (e) {
    console.error('uploadResume error:', e);
    return res.status(500).json({ message: 'Failed to upload resume' });
  }
};

exports.updateResume = async (req, res) => {
  try {
    const userId = req.user.id;
    const resumeId = req.params.id;
    const { title, resumeText } = req.body || {};

    const resume = await Resume.findOne({ _id: resumeId, userId });
    if (!resume) return res.status(404).json({ message: 'Resume not found' });

    if (typeof title === 'string' && title.trim()) resume.title = title.trim();
    if (typeof resumeText === 'string' && resumeText.trim()) {
      resume.resumeText = resumeText;
      resume.aiContext = extractAiContextFromText(resumeText);
    }

    await resume.save();
    return res.json(resume);
  } catch (e) {
    console.error('updateResume error:', e);
    return res.status(500).json({ message: 'Failed to update resume' });
  }
};

exports.deleteResume = async (req, res) => {
  try {
    const userId = req.user.id;
    const resumeId = req.params.id;

    const deleted = await Resume.findOneAndDelete({ _id: resumeId, userId });
    if (!deleted) return res.status(404).json({ message: 'Resume not found' });

    return res.json({ ok: true });
  } catch (e) {
    console.error('deleteResume error:', e);
    return res.status(500).json({ message: 'Failed to delete resume' });
  }
};
