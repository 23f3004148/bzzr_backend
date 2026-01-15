const express = require('express');
const axios = require('axios');
const { authRequired, adminOnly } = require('../middleware/auth');
const AdminSettings = require('../models/adminSettings');

const router = express.Router();

// NOTE: Allow any authenticated user to fetch the Deepgram key.
// This matches the behavior in the "buuuzzzer final" build where
// transcription is performed client-side via Deepgram WebSocket.
router.get('/key', authRequired, async (req, res) => {
  try {
    const settings = await AdminSettings.getConfig();
    if (!settings.deepgramApiKey) {
      return res.status(404).json({ error: 'Deepgram API key not configured' });
    }
    res.json({ deepgramApiKey: settings.deepgramApiKey });
  } catch (err) {
    console.error('Failed to fetch Deepgram key', err);
    res.status(500).json({ error: 'Failed to fetch Deepgram key' });
  }
});

router.get('/test', authRequired, adminOnly, async (req, res) => {
  try {
    const settings = await AdminSettings.getConfig();
    const apiKey = settings?.deepgramApiKey || process.env.DEEPGRAM_API_KEY;
    
    if (!apiKey) {
      return res.status(400).json({ 
        status: 'ERROR',
        message: 'Deepgram API key not configured',
        instructions: 'Please set your Deepgram API key in admin settings'
      });
    }

    // Test the connection to Deepgram API
    try {
      const testResp = await axios.get('https://api.deepgram.com/v1/models', {
        headers: {
          Authorization: `Token ${apiKey}`
        },
        timeout: 10000
      });
      
      return res.json({
        status: 'SUCCESS',
        message: 'Deepgram API connection successful',
        deepgramStatus: 'Connected',
        apiKeyLength: apiKey.length,
        availableModels: testResp.data?.models?.length || 'unknown'
      });
    } catch (connErr) {
      const errCode = connErr?.code;
      const errStatus = connErr?.response?.status;
      
      if (errStatus === 401) {
        return res.status(401).json({
          status: 'ERROR',
          message: 'Invalid Deepgram API key (401 Unauthorized)',
          troubleshooting: 'Check that your API key is correct and not expired. Get a new key from https://console.deepgram.com'
        });
      }
      
      return res.status(503).json({
        status: 'ERROR',
        message: `Deepgram connection failed: ${errCode || errStatus || 'unknown error'}`,
        troubleshooting: {
          'ECONNABORTED': 'Connection was aborted. Check your network and firewall settings.',
          'ECONNREFUSED': 'Connection refused. Deepgram API may be down or unreachable.',
          'ETIMEDOUT': 'Request timed out. Check your internet connection.',
          'ENOTFOUND': 'DNS resolution failed. Check your internet connection.'
        }[errCode] || 'Network or connectivity issue',
        errorCode: errCode,
        httpStatus: errStatus
      });
    }
  } catch (err) {
    console.error('Deepgram test failed', err);
    res.status(500).json({ 
      status: 'ERROR',
      message: 'Deepgram test failed',
      error: err.message 
    });
  }
});

module.exports = router;
