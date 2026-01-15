const express = require('express');

const router = express.Router();

function isAllowedRedirect(redirectUri) {
  if (typeof redirectUri !== 'string') return false;

  // Two common redirect URL formats for Chrome extensions:
  // 1) chrome-extension://<extensionId>/...
  // 2) https://<extensionId>.chromiumapp.org/<path>  (returned by chrome.identity.getRedirectURL)
  if (redirectUri.startsWith('chrome-extension://')) return true;
  if (redirectUri.startsWith('https://') && redirectUri.includes('.chromiumapp.org/')) return true;
  return false;
}

// GET /extension/auth?redirect_uri=<EXTENSION_REDIRECT_URL>
// Minimal login page for the Chrome extension. It calls POST /api/auth/login
// and then redirects to redirect_uri#token=<JWT>.
router.get('/auth', (req, res) => {
  const redirectUri = String(req.query.redirect_uri || '');

  if (!isAllowedRedirect(redirectUri)) {
    return res.status(400).send('Invalid redirect_uri.');
  }
  const frontendBase = (() => {
    if (process.env.FRONTEND_URL) {
      return process.env.FRONTEND_URL;
    }

    // FRONTEND_ORIGIN may be a comma-separated list for CORS. Pick the first
    // entry as the canonical frontend for redirects.
    const raw = String(process.env.FRONTEND_ORIGIN || '').trim();
    if (raw) {
      return raw.split(',')[0].trim();
    }

    return 'http://localhost:3000';
  })();
  let target = `${frontendBase.replace(/\/+$/, '')}/extension/auth?redirect_uri=${encodeURIComponent(
    redirectUri
  )}`;

  try {
    const url = new URL('/extension/auth', frontendBase);
    url.searchParams.set('redirect_uri', redirectUri);
    target = url.toString();
  } catch (_err) {
    // fall back to the concatenated string
  }

  return res.redirect(target);
});

module.exports = router;
