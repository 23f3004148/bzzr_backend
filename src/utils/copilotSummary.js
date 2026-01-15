const { callAI } = require('../services/aiProvider');

const extractJsonBlock = (text) => {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const noFence = raw.replace(/```json|```/gi, '').trim();
  const start = noFence.indexOf('{');
  const end = noFence.lastIndexOf('}');
  if (start >= 0 && end > start) return noFence.slice(start, end + 1);
  return '';
};

const parseSummaryJson = (text) => {
  const jsonText = extractJsonBlock(text);
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText);
  } catch (_err) {
    return null;
  }
};

const normalizeSummaryList = (value) => {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v || '').trim()).filter(Boolean).slice(0, 20);
};

const summarizeCopilotSession = async (session, provider) => {
  const transcriptText = Array.isArray(session?.transcript)
    ? session.transcript.map((line) => line?.text || '').filter(Boolean).join('\n')
    : '';
  if (!transcriptText.trim()) return null;

  const topicText = Array.isArray(session?.topics)
    ? session.topics.map((t) => t?.text || '').filter(Boolean).join('\n')
    : '';

  const systemMsg = {
    role: 'system',
    content:
      'You are a session summarizer. Return JSON only with keys: summary (string), topics (array), strengths (array), gaps (array), next_steps (array).',
  };
  const userMsg = {
    role: 'user',
    content: `Summarize this session.\nTopics:\n${topicText}\n\nTranscript:\n${transcriptText}`,
  };

  const output = await callAI({ provider, messages: [systemMsg, userMsg] });
  const summaryJson = parseSummaryJson(output);
  const summaryTopics = normalizeSummaryList(summaryJson?.topics || summaryJson?.topic || []);
  const summaryText = summaryJson?.summary ? String(summaryJson.summary) : String(output || '');

  return {
    summaryText,
    summaryData: summaryJson || undefined,
    summaryTopics,
  };
};

module.exports = {
  summarizeCopilotSession,
};
