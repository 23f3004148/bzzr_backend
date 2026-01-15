const axios = require('axios');
const { getCachedConfig } = require('./adminConfigCache');

async function callAI({ provider, messages }) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('messages array required');
  }
  const settings = await getCachedConfig();
  const effectiveProvider = (provider || settings?.defaultProvider || 'openai').toLowerCase();

  const flattenContent = (content) => {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (part?.type === 'text') return String(part.text || '');
          if (part?.type === 'image_url') return `[Image: ${part?.image_url?.url || ''}]`;
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }
    if (content && typeof content === 'object' && 'text' in content) {
      return String(content.text || '');
    }
    try {
      return JSON.stringify(content);
    } catch (e) {
      return String(content || '');
    }
  };

  const normalizeForTextModel = (msgs) =>
    msgs.map((m) => ({
      role: m.role,
      content: flattenContent(m.content),
    }));

  if (effectiveProvider === 'openai') {
    const apiKey = settings?.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OpenAI API key not configured');
    const model = settings?.openaiModel || 'gpt-4o-mini';
    const resp = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model,
        messages
      },
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    return resp.data.choices[0].message.content;
  }

  if (effectiveProvider === 'gemini') {
    const normalized = normalizeForTextModel(messages);
    const apiKey = settings?.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Gemini API key not configured');
    const model = settings?.geminiModel || 'gemini-2.0-flash';
    const prompt = normalized.map(m => `${m.role?.toUpperCase() || 'USER'}: ${m.content || ''}`).join('\n');

    const resp = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { contents: [{ parts: [{ text: prompt }] }] }
    );
    return resp.data.candidates[0].content.parts[0].text;
  }

  if (effectiveProvider === 'deepseek') {
    const normalized = normalizeForTextModel(messages);
    const apiKey = settings?.deepseekApiKey || process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error('DeepSeek API key not configured');
    const model = settings?.deepseekModel || 'deepseek-chat';
    const resp = await axios.post(
      'https://api.deepseek.com/chat/completions',
      {
        model,
        messages: normalized
      },
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    return resp.data.choices[0].message.content;
  }

  throw new Error(`Unsupported provider: ${effectiveProvider}`);
}

module.exports = { callAI };
