const axios = require('axios');
const AdminSettings = require('../models/adminSettings');

async function getDeepgramKey() {
  const settings = await AdminSettings.getConfig();
  return settings?.deepgramApiKey || process.env.DEEPGRAM_API_KEY;
}

/**
 * Transcribe audio buffer using Deepgram.
 * @param {Buffer} buffer
 * @param {string} contentType - MIME type of the audio (e.g. audio/webm, audio/wav).
 */
async function transcribeAudio(buffer, contentType) {
  const apiKey = await getDeepgramKey();
  if (!apiKey) throw new Error('Deepgram API key not configured');

  // Validate buffer
  if (!buffer || buffer.length === 0) {
    throw new Error('Audio buffer is empty');
  }

  const ct = (contentType && String(contentType).startsWith('audio/')) ? contentType : 'audio/webm';
  console.log(`[Deepgram] Starting transcription: bufferSize=${buffer.length}, contentType=${ct}`);

  try {
    const params = new URLSearchParams({
      model: 'nova-2',
      language: 'en-US',
      punctuate: 'true',
      smart_format: 'true'
    });

    const resp = await axios.post(
      `https://api.deepgram.com/v1/listen?${params.toString()}`,
      buffer,
      {
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': ct
        },
        timeout: 30000, // Increase timeout to 30s for larger audio chunks
        maxContentLength: 26214400, // 25MB
        maxBodyLength: 26214400, // 25MB
      }
    );
    console.log(`[Deepgram] Transcription success: ${resp.data?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.substring?.(0, 50) || 'empty'}`);
    return resp.data;
  } catch (err) {
    // Normalize axios/connection errors for easier debugging
    const status = err?.response?.status;
    const body = err?.response?.data;
    const code = err?.code;
    const message = err?.message;
    
    console.error(`[Deepgram] Error details: code=${code}, status=${status}, message=${message}`);
    
    if (code === 'ECONNRESET' || code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
      throw new Error(`Deepgram connection issue: ${code}. Check your internet connection and Deepgram API status.`);
    }
    if (status === 401) {
      throw new Error('Invalid Deepgram API key. Please check your credentials in admin settings.');
    }
    if (status === 429) {
      throw new Error('Deepgram rate limit exceeded. Please try again in a moment.');
    }
    
    const detail = body ? JSON.stringify(body) : message || 'Deepgram request failed';
    throw new Error(`Deepgram error: ${detail}`);
  }
}

module.exports = { transcribeAudio };
