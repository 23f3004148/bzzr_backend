const express = require('express');
const { authRequired, adminOnly } = require('../middleware/auth');
const BlogPost = require('../models/blogPost');
const Testimonial = require('../models/testimonial');
const Faq = require('../models/faq');
const AdminSettings = require('../models/adminSettings');
const PricingBundle = require('../models/pricingBundle');
const multer = require('multer');
const path = require('path');

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '..', '..', 'uploads'),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e5)}`;
      const ext = path.extname(file.originalname || '');
      cb(null, `${unique}${ext}`);
    },
  }),
});

const router = express.Router();

const toOptionalDate = (value) => {
  if (!value) return undefined;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return undefined;
  return dt;
};

router.use(authRequired, adminOnly);

router.post('/upload-image', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
});

// Blog posts -----------------------------------------------------------------
router.get('/blog-posts', async (_req, res) => {
  const posts = await BlogPost.find().sort({ createdAt: -1 });
  res.json(posts);
});

router.post('/blog-posts', async (req, res) => {
  const payload = req.body || {};
  const created = await BlogPost.create({
    title: payload.title,
    heroImage: payload.heroImage,
    content: payload.content,
    bullets: Array.isArray(payload.bullets) ? payload.bullets : [],
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    status: payload.status || 'standard'
  });
  res.status(201).json(created);
});

router.put('/blog-posts/:id', async (req, res) => {
  const { id } = req.params;
  const payload = req.body || {};
  const updated = await BlogPost.findByIdAndUpdate(
    id,
    {
      title: payload.title,
      heroImage: payload.heroImage,
      content: payload.content,
      bullets: Array.isArray(payload.bullets) ? payload.bullets : [],
      tags: Array.isArray(payload.tags) ? payload.tags : [],
      status: payload.status || 'standard'
    },
    { new: true }
  );
  if (!updated) return res.status(404).json({ error: 'Blog post not found' });
  res.json(updated);
});

router.delete('/blog-posts/:id', async (req, res) => {
  const { id } = req.params;
  const deleted = await BlogPost.findByIdAndDelete(id);
  if (!deleted) return res.status(404).json({ error: 'Blog post not found' });
  res.json({ message: 'Deleted' });
});

// Testimonials ---------------------------------------------------------------
router.get('/testimonials', async (_req, res) => {
  const testimonials = await Testimonial.find().sort({ createdAt: -1 });
  res.json(testimonials);
});

router.post('/testimonials', async (req, res) => {
  const payload = req.body || {};
  const created = await Testimonial.create({
    name: payload.name,
    role: payload.role,
    company: payload.company,
    quote: payload.quote,
    photoUrl: payload.photoUrl,
    rating: payload.rating || 5
  });
  res.status(201).json(created);
});

router.put('/testimonials/:id', async (req, res) => {
  const { id } = req.params;
  const payload = req.body || {};
  const updated = await Testimonial.findByIdAndUpdate(
    id,
    {
      name: payload.name,
      role: payload.role,
      company: payload.company,
      quote: payload.quote,
      photoUrl: payload.photoUrl,
      rating: payload.rating || 5
    },
    { new: true }
  );
  if (!updated) return res.status(404).json({ error: 'Testimonial not found' });
  res.json(updated);
});

router.delete('/testimonials/:id', async (req, res) => {
  const { id } = req.params;
  const deleted = await Testimonial.findByIdAndDelete(id);
  if (!deleted) return res.status(404).json({ error: 'Testimonial not found' });
  res.json({ message: 'Deleted' });
});

// FAQs -----------------------------------------------------------------------
router.get('/faqs', async (_req, res) => {
  const faqs = await Faq.find().sort({ createdAt: -1 });
  res.json(faqs);
});

router.post('/faqs', async (req, res) => {
  const payload = req.body || {};
  const created = await Faq.create({
    question: payload.question,
    answer: payload.answer
  });
  res.status(201).json(created);
});

router.put('/faqs/:id', async (req, res) => {
  const { id } = req.params;
  const payload = req.body || {};
  const updated = await Faq.findByIdAndUpdate(
    id,
    {
      question: payload.question,
      answer: payload.answer
    },
    { new: true }
  );
  if (!updated) return res.status(404).json({ error: 'FAQ not found' });
  res.json(updated);
});

router.delete('/faqs/:id', async (req, res) => {
  const { id } = req.params;
  const deleted = await Faq.findByIdAndDelete(id);
  if (!deleted) return res.status(404).json({ error: 'FAQ not found' });
  res.json({ message: 'Deleted' });
});

// Site info (social/contact) -------------------------------------------------
router.get('/site-info', async (_req, res) => {
  const settings = await AdminSettings.getConfig();
  res.json({
    supportPhone: settings.supportPhone || '',
    contactEmail: settings.contactEmail || '',
    whatsappNumber: settings.whatsappNumber || '',
    instagramUrl: settings.instagramUrl || '',
    linkedinUrl: settings.linkedinUrl || '',
    youtubeUrl: settings.youtubeUrl || '',
    footerTagline: settings.footerTagline || ''
  });
});

router.put('/site-info', async (req, res) => {
  const payload = req.body || {};
  const settings = await AdminSettings.getConfig();
  settings.supportPhone = payload.supportPhone ?? settings.supportPhone;
  settings.contactEmail = payload.contactEmail ?? settings.contactEmail;
  settings.whatsappNumber = payload.whatsappNumber ?? settings.whatsappNumber;
  settings.instagramUrl = payload.instagramUrl ?? settings.instagramUrl;
  settings.linkedinUrl = payload.linkedinUrl ?? settings.linkedinUrl;
  settings.youtubeUrl = payload.youtubeUrl ?? settings.youtubeUrl;
  settings.footerTagline = payload.footerTagline ?? settings.footerTagline;
  if (payload.freeTrialAiCredits !== undefined) settings.freeTrialAiCredits = payload.freeTrialAiCredits;
  if (payload.freeTrialMentorCredits !== undefined) settings.freeTrialMentorCredits = payload.freeTrialMentorCredits;
  await settings.save();
  res.json({
    supportPhone: settings.supportPhone || '',
    contactEmail: settings.contactEmail || '',
    whatsappNumber: settings.whatsappNumber || '',
    instagramUrl: settings.instagramUrl || '',
    linkedinUrl: settings.linkedinUrl || '',
    youtubeUrl: settings.youtubeUrl || '',
    footerTagline: settings.footerTagline || '',
    freeTrialAiCredits: settings.freeTrialAiCredits ?? 0,
    freeTrialMentorCredits: settings.freeTrialMentorCredits ?? 0
  });
});

// Pricing Bundles ------------------------------------------------------------
router.get('/pricing-bundles', async (_req, res) => {
  const bundles = await PricingBundle.find().sort({ createdAt: -1 });
  res.json(bundles);
});

router.post('/pricing-bundles', async (req, res) => {
  const payload = req.body || {};
  const created = await PricingBundle.create({
    name: payload.name,
    priceInr: payload.priceInr,
    credits: payload.credits,
    bonusCredits: payload.bonusCredits || 0,
    description: payload.description,
    features: Array.isArray(payload.features) ? payload.features : [],
    popular: Boolean(payload.popular),
    tag: payload.tag || '',
    displayOrder: Number(payload.displayOrder) || 0,
    showOnLanding: payload.showOnLanding !== undefined ? Boolean(payload.showOnLanding) : true,
    offerDiscountPercent: Number(payload.offerDiscountPercent) || 0,
    offerBonusCredits: Number(payload.offerBonusCredits) || 0,
    offerStart: toOptionalDate(payload.offerStart),
    offerEnd: toOptionalDate(payload.offerEnd),
    offerBadge: payload.offerBadge || '',
  });
  res.status(201).json(created);
});

router.put('/pricing-bundles/:id', async (req, res) => {
  const { id } = req.params;
  const payload = req.body || {};
  const updated = await PricingBundle.findByIdAndUpdate(
    id,
    {
      name: payload.name,
      priceInr: payload.priceInr,
      credits: payload.credits,
      bonusCredits: payload.bonusCredits || 0,
      description: payload.description,
      features: Array.isArray(payload.features) ? payload.features : [],
      popular: Boolean(payload.popular),
      tag: payload.tag || '',
      displayOrder: Number(payload.displayOrder) || 0,
      showOnLanding: payload.showOnLanding !== undefined ? Boolean(payload.showOnLanding) : true,
      offerDiscountPercent: Number(payload.offerDiscountPercent) || 0,
      offerBonusCredits: Number(payload.offerBonusCredits) || 0,
      offerStart: toOptionalDate(payload.offerStart),
      offerEnd: toOptionalDate(payload.offerEnd),
      offerBadge: payload.offerBadge || '',
    },
    { new: true }
  );
  if (!updated) return res.status(404).json({ error: 'Pricing bundle not found' });
  res.json(updated);
});

router.delete('/pricing-bundles/:id', async (req, res) => {
  const { id } = req.params;
  const deleted = await PricingBundle.findByIdAndDelete(id);
  if (!deleted) return res.status(404).json({ error: 'Pricing bundle not found' });
  res.json({ message: 'Deleted' });
});

module.exports = router;
