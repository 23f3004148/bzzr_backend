const express = require('express');
const BlogPost = require('../models/blogPost');
const Testimonial = require('../models/testimonial');
const Faq = require('../models/faq');
const AdminSettings = require('../models/adminSettings');
const PricingBundle = require('../models/pricingBundle');

const router = express.Router();

router.get('/blog-posts', async (req, res) => {
  const { tag } = req.query;
  const query = {};
  if (tag) {
    query.$or = [{ status: tag }, { tags: tag }];
  }
  const posts = await BlogPost.find(query).sort({ createdAt: -1 });
  res.json(posts);
});

router.get('/testimonials', async (_req, res) => {
  const testimonials = await Testimonial.find().sort({ createdAt: -1 });
  res.json(testimonials);
});

router.get('/faqs', async (_req, res) => {
  const faqs = await Faq.find().sort({ createdAt: -1 });
  res.json(faqs);
});

router.get('/site-info', async (_req, res) => {
  const settings = await AdminSettings.getConfig();
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

router.get('/pricing-bundles', async (_req, res) => {
  const bundles = await PricingBundle.find().sort({ priceInr: 1 });
  res.json(bundles);
});

module.exports = router;
