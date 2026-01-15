const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const ServiceError = require('../errors/serviceError');
const userRepository = require('../repositories/userRepository');
const adminSettingsRepository = require('../repositories/adminSettingsRepository');
const contactRepository = require('../repositories/contactSubmissionRepository');
const formApiKeyRepository = require('../repositories/formApiKeyRepository');
const { invalidateAdminConfigCache } = require('./adminConfigCache');

const ADMIN_RESET_KEY = process.env.ADMIN_RESET_KEY;
const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';
const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';
const DEFAULT_AI_CREDIT_PRICE = 5;
const DEFAULT_MENTOR_CREDIT_PRICE = 15;

const maskKey = (key) => {
  if (!key) return null;
  const visible = 4;
  const prefix = key.slice(0, visible);
  const suffix = key.slice(-visible);
  return `${prefix}••••${suffix}`;
};

const isMaskedKey = (value) =>
  typeof value === 'string' && (value.includes('••') || /^.{0,6}•{2,}.+$/.test(value));

const resetCredentials = async ({ loginId, password, name, resetKey }) => {
  if (!loginId || !password) {
    throw new ServiceError('loginId and password are required', 400, 'VALIDATION_ERROR');
  }
  if (!ADMIN_RESET_KEY) {
    throw new ServiceError('ADMIN_RESET_KEY not configured', 500, 'SERVER_ERROR');
  }
  if (resetKey !== ADMIN_RESET_KEY) {
    throw new ServiceError('Invalid reset key', 401, 'UNAUTHORIZED');
  }

  const hash = await bcrypt.hash(password, 10);
  let admin = await userRepository.findAdmin();
  if (!admin) {
    admin = await userRepository.createUser({
      loginId,
      name: name || 'System Admin',
      passwordHash: hash,
      role: 'admin',
      active: true
    });
  } else {
    admin.loginId = loginId;
    admin.passwordHash = hash;
    if (name && name.trim()) {
      admin.name = name.trim();
    }
    admin.active = true;
    await admin.save();
  }
};

const getSettings = async () => {
  const settings = await adminSettingsRepository.getConfig();
  return {
    default_provider: settings.defaultProvider,
    has_openai_key: Boolean(settings.openaiApiKey),
    has_gemini_key: Boolean(settings.geminiApiKey),
    has_deepseek_key: Boolean(settings.deepseekApiKey),
    has_deepgram_key: Boolean(settings.deepgramApiKey),
    has_razorpay_key: Boolean(settings.razorpayKeyId && settings.razorpayKeySecret),
    openai_key_masked: maskKey(settings.openaiApiKey),
    gemini_key_masked: maskKey(settings.geminiApiKey),
    deepseek_key_masked: maskKey(settings.deepseekApiKey),
    deepgram_key_masked: maskKey(settings.deepgramApiKey),
    razorpay_key_masked: maskKey(settings.razorpayKeyId),
    openai_key_length: settings.openaiApiKey ? settings.openaiApiKey.length : 0,
    gemini_key_length: settings.geminiApiKey ? settings.geminiApiKey.length : 0,
    deepseek_key_length: settings.deepseekApiKey ? settings.deepseekApiKey.length : 0,
    deepgram_key_length: settings.deepgramApiKey ? settings.deepgramApiKey.length : 0,
    support_phone: settings.supportPhone || null,
    contact_email: settings.contactEmail || null,
    whatsapp_number: settings.whatsappNumber || null,
    free_trial_ai_credits: settings.freeTrialAiCredits ?? 25,
    free_trial_mentor_credits: settings.freeTrialMentorCredits ?? 0,
    openai_model: settings.openaiModel || DEFAULT_OPENAI_MODEL,
    gemini_model: settings.geminiModel || DEFAULT_GEMINI_MODEL,
    deepseek_model: settings.deepseekModel || DEFAULT_DEEPSEEK_MODEL,
    ai_credit_price: settings.aiCreditPrice ?? DEFAULT_AI_CREDIT_PRICE,
    mentor_credit_price: settings.mentorCreditPrice ?? DEFAULT_MENTOR_CREDIT_PRICE,
    min_credit_purchase: settings.minCreditPurchase ?? 120,
    instagram_url: settings.instagramUrl || '',
    linkedin_url: settings.linkedinUrl || '',
    youtube_url: settings.youtubeUrl || '',
    footer_tagline: settings.footerTagline || 'BUUZZER interview copilot',
    session_grace_minutes: settings.sessionGraceMinutes ?? 3,
    session_hard_stop_enabled: settings.sessionHardStopEnabled !== false
  };
};

const updateSettings = async (payload) => {
  const settings = await adminSettingsRepository.getConfig();
  if (payload.defaultProvider !== undefined) {
    settings.defaultProvider = payload.defaultProvider;
  }
  if (payload.openaiModel !== undefined) {
    settings.openaiModel = payload.openaiModel || undefined;
  }
  if (payload.geminiModel !== undefined) {
    settings.geminiModel = payload.geminiModel || undefined;
  }
  if (payload.deepseekModel !== undefined) {
    settings.deepseekModel = payload.deepseekModel || undefined;
  }
  if (payload.openaiApiKey !== undefined && !isMaskedKey(payload.openaiApiKey)) {
    settings.openaiApiKey = payload.openaiApiKey || undefined;
  }
  if (payload.geminiApiKey !== undefined && !isMaskedKey(payload.geminiApiKey)) {
    settings.geminiApiKey = payload.geminiApiKey || undefined;
  }
  if (payload.deepseekApiKey !== undefined && !isMaskedKey(payload.deepseekApiKey)) {
    settings.deepseekApiKey = payload.deepseekApiKey || undefined;
  }
  if (payload.deepgramApiKey !== undefined && !isMaskedKey(payload.deepgramApiKey)) {
    settings.deepgramApiKey = payload.deepgramApiKey || undefined;
  }
  if (payload.supportPhone !== undefined) {
    settings.supportPhone = payload.supportPhone ? payload.supportPhone.toString().trim() : payload.supportPhone;
  }
  if (payload.contactEmail !== undefined) {
    settings.contactEmail = payload.contactEmail || '';
  }
  if (payload.whatsappNumber !== undefined) {
    settings.whatsappNumber = payload.whatsappNumber || '';
  }
  if (payload.instagramUrl !== undefined) {
    settings.instagramUrl = payload.instagramUrl || '';
  }
  if (payload.linkedinUrl !== undefined) {
    settings.linkedinUrl = payload.linkedinUrl || '';
  }
  if (payload.youtubeUrl !== undefined) {
    settings.youtubeUrl = payload.youtubeUrl || '';
  }
  if (payload.footerTagline !== undefined) {
    settings.footerTagline = payload.footerTagline || '';
  }
  if (payload.freeTrialAiCredits !== undefined) {
    settings.freeTrialAiCredits = Number(payload.freeTrialAiCredits) || 0;
  }
  if (payload.freeTrialMentorCredits !== undefined) {
    settings.freeTrialMentorCredits = Number(payload.freeTrialMentorCredits) || 0;
  }
  if (payload.sessionGraceMinutes !== undefined) {
    settings.sessionGraceMinutes = Number(payload.sessionGraceMinutes) || 0;
  }
  if (payload.sessionHardStopEnabled !== undefined) {
    settings.sessionHardStopEnabled = Boolean(payload.sessionHardStopEnabled);
  }
  if (payload.minCreditPurchase !== undefined) {
    const minValue = Number(payload.minCreditPurchase);
    settings.minCreditPurchase = Number.isFinite(minValue) ? Math.max(1, minValue) : 120;
  }
  if (payload.aiCreditPrice !== undefined) {
    settings.aiCreditPrice = Number(payload.aiCreditPrice) || DEFAULT_AI_CREDIT_PRICE;
  }
  if (payload.mentorCreditPrice !== undefined) {
    settings.mentorCreditPrice = Number(payload.mentorCreditPrice) || DEFAULT_MENTOR_CREDIT_PRICE;
  }
  if (payload.razorpayKeyId !== undefined && !isMaskedKey(payload.razorpayKeyId)) {
    settings.razorpayKeyId = payload.razorpayKeyId || undefined;
  }
  if (payload.razorpayKeySecret !== undefined && !isMaskedKey(payload.razorpayKeySecret)) {
    settings.razorpayKeySecret = payload.razorpayKeySecret || undefined;
  }
  await settings.save();
  invalidateAdminConfigCache();
  return settings;
};

const listContactSubmissions = () => contactRepository.listAll();
const deleteContactSubmission = (id) => contactRepository.deleteById(id);

const createFormKey = async (description) => {
  const key = crypto.randomBytes(24).toString('hex');
  return formApiKeyRepository.createKey({
    key,
    description: description || undefined
  });
};

const getDefaultProvider = async () => {
  const settings = await adminSettingsRepository.getConfig();
  return settings.defaultProvider;
};

const getSupportContact = async () => {
  const settings = await adminSettingsRepository.getConfig();
  return settings.supportPhone || null;
};

const getCreditPricing = async () => {
  const settings = await adminSettingsRepository.getConfig();
  const aiCreditPrice = Number.isFinite(settings.aiCreditPrice)
    ? settings.aiCreditPrice
    : DEFAULT_AI_CREDIT_PRICE;
  const mentorCreditPrice = Number.isFinite(settings.mentorCreditPrice)
    ? settings.mentorCreditPrice
    : DEFAULT_MENTOR_CREDIT_PRICE;
  const minCreditPurchase = Number.isFinite(settings.minCreditPurchase)
    ? settings.minCreditPurchase
    : 120;
  return { aiCreditPrice, mentorCreditPrice, minCreditPurchase };
};

module.exports = {
  resetCredentials,
  getSettings,
  updateSettings,
  listContactSubmissions,
  deleteContactSubmission,
  createFormKey,
  getDefaultProvider,
  getSupportContact,
  getCreditPricing
};
