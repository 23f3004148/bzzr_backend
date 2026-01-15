// const http = require('http');
// const express = require('express');
// const cors = require('cors');
// const { Server } = require('socket.io');
// require('dotenv').config();
// const mongoose = require('./db/mongo');
// const authRoutes = require('./routes/auth');
// const userRoutes = require('./routes/users');
// const interviewRoutes = require('./routes/interviews');
// const adminRoutes = require('./routes/admin');
// const contactRoutes = require('./routes/contact');
// const aiRoutes = require('./routes/ai');
// const transcribeRoutes = require('./routes/transcribe');
// const deepgramRoutes = require('./routes/deepgram');
// const configRoutes = require('./routes/config');
// const meetingRoutes = require('./routes/meetings');
// const Meeting = require('./models/meeting');
// const app = express();
// app.use(cors());
// app.use(express.json());
// app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
// app.use('/api/auth', authRoutes);
// app.use('/api/users', userRoutes);
// app.use('/api/interviews', interviewRoutes);
// app.use('/api/admin', adminRoutes);
// app.use('/api/contact', contactRoutes);
// app.use('/api/ai', aiRoutes);
// app.use('/api/transcribe', transcribeRoutes);
// app.use('/api/deepgram', deepgramRoutes);
// app.use('/api/config', configRoutes);
// app.use('/api/meetings', meetingRoutes);
// const server = http.createServer(app);
// const frontendOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
//   .split(',')
//   .map((origin) => origin.trim())
//   .filter(Boolean);
// const io = new Server(server, {
//   cors: {
//     origin: frontendOrigins,
//     methods: ['GET', 'POST'],
//     credentials: true,
//   },
// });
// io.on('connection', (socket) => {
//   socket.on('join_meeting', async ({ meetingId, meetingKey, role }) => {
//     if (!meetingId || !meetingKey) {
//       socket.emit('meeting_error', { message: 'Missing meeting reference' });
//       return;
//     }
//     try {
//       const meeting = await Meeting.findById(meetingId);
//       if (!meeting || meeting.meetingKey !== meetingKey.toUpperCase()) {
//         socket.emit('meeting_error', { message: 'Meeting not found or invalid key' });
//         return;
//       }
//       socket.join(meetingId);
//       socket.data.meetingId = meetingId;
//       socket.data.meetingKey = meetingKey.toUpperCase();
//       socket.data.role = role;
//       socket.emit('meeting_joined', {
//         meetingId,
//         meetingKey: meeting.meetingKey,
//         status: meeting.status,
//       });
//       socket.emit('meeting_status', { status: meeting.status });
//     } catch (err) {
//       console.error('Socket join error', err);
//       socket.emit('meeting_error', { message: 'Failed to join meeting' });
//     }
//   });
//   socket.on('meeting_transcript_chunk', async ({ meetingId, text }) => {
//     if (!meetingId || !text) return;
//     if (socket.data.role !== 'mentor') return;
//     try {
//       const meeting = await Meeting.findById(meetingId);
//       if (!meeting) return;
//       const trimmed = text.trim();
//       if (!trimmed) return;
//       const existingTranscript = meeting.transcript || '';
//       meeting.transcript = existingTranscript
//         ? `${existingTranscript}\n${trimmed}`
//         : trimmed;
//       await meeting.save();
//       io.to(meetingId).emit('meeting_transcript_chunk', {
//         text: trimmed,
//         timestamp: new Date().toISOString(),
//         from: 'mentor',
//       });
//     } catch (err) {
//       console.error('Failed to append transcript chunk', err);
//     }
//   });

//   socket.on('meeting_status_update', ({ meetingId, status }) => {
//     const valid = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED'];
//     if (!meetingId || !status || !valid.includes(status)) return;
//     if (socket.data.role !== 'mentor') return;
//     io.to(meetingId).emit('meeting_status', { status });
//   });

//   socket.on('meeting_end', async ({ meetingId }) => {
//     if (!meetingId) return;
//     if (socket.data.role !== 'mentor') return;
//     try {
//       const meeting = await Meeting.findById(meetingId);
//       if (!meeting) return;
//       meeting.status = 'COMPLETED';
//       await meeting.save();
//       io.to(meetingId).emit('meeting_status', { status: 'COMPLETED' });
//     } catch (err) {
//       console.error('Failed to mark meeting completed', err);
//     }
//   });
// });

// let serverStarted = false;

// const startServer = () => {
//   if (serverStarted) return;
//   serverStarted = true;
//   const port = process.env.PORT || 4000;
//   server.listen(port, () => {
//     console.log(`Server running on port ${port}`);
//   });
// };

// if (mongoose.connection.readyState === 1) {
//   startServer();
// } else {
//   mongoose.connection.once('connected', startServer);
// }

// backend/src/index.js
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const path = require('path');
require('./utils/env');
const mongoose = require('./db/mongo');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const interviewRoutes = require('./routes/interviews');
const adminRoutes = require('./routes/admin');
const contactRoutes = require('./routes/contact');
const aiRoutes = require('./routes/ai');
const bcrypt = require('bcryptjs');
const transcribeRoutes = require('./routes/transcribe');
const deepgramRoutes = require('./routes/deepgram');
const configRoutes = require('./routes/config');
const meetingRoutes = require('./routes/meetings');
const extensionAuthRoutes = require('./routes/extensionAuth');
const profileRoutes = require('./routes/profile');
const resumeRoutes = require('./routes/resumes');
const walletRoutes = require('./routes/wallet');
const paymentRoutes = require('./routes/payments');
const contentRoutes = require('./routes/content');
const adminContentRoutes = require('./routes/adminContent');
const Meeting = require('./models/meeting');
const Interview = require('./models/interview');
const UserModel = require('./models/user');
const { callAI } = require('./services/aiProvider');
const { getCachedConfig } = require('./services/adminConfigCache');
const {
  getBillingConfig,
  computeElapsedSeconds,
  computeBillableSeconds,
  computeBillableMinutes,
} = require('./utils/sessionBilling');
const { Readable } = require('stream');
const copilotSessionRoutes = require('./routes/copilotSessions');
const CopilotSession = require('./models/copilotSession');
const { summarizeCopilotSession } = require('./utils/copilotSummary');
const pendingCodeRequests = new Map(); // sid -> { provider, messages }
const lastScreenshots = new Map(); // sid -> [dataUrl]

const app = express();

const normalizeOrigin = (origin) => (origin ? origin.trim().replace(/\/$/, '') : '');
const isExtensionOrigin = (origin) => origin.startsWith('chrome-extension://');
const isChromiumAppOrigin = (origin) => {
  try {
    const url = new URL(origin);
    return url.hostname.endsWith('.chromiumapp.org');
  } catch (_err) {
    return false;
  }
};

const serverPort = Number.parseInt(process.env.PORT, 10) || 4000;
const serverHost = process.env.HOST || '0.0.0.0';
const selfOrigins = [
  `http://${serverHost}:${serverPort}`,
  `http://${serverHost}`,
  `http://localhost:${serverPort}`,
  `http://127.0.0.1:${serverPort}`,
  `https://${serverHost}:${serverPort}`,
  `https://${serverHost}`,
  `https://localhost:${serverPort}`,
  `https://127.0.0.1:${serverPort}`,
].map((o) => normalizeOrigin(o));

const defaultOrigins = ['http://localhost:5173', 'http://localhost:3000'];
const allowedOrigins = (process.env.FRONTEND_ORIGIN || defaultOrigins.join(','))
  .split(',')
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean)
  .concat(selfOrigins);

const allowOrigin = (origin, callback) => {
  // Allow requests without an origin header (e.g., same-origin, no-cors mode)
  if (!origin) {
    return callback(null, true);
  }
  
  const normalized = normalizeOrigin(origin);
  if (!normalized) {
    return callback(null, true);
  }
  
  // Always allow extension origins, chromium app origins, and listed origins
  if (isExtensionOrigin(normalized) || isChromiumAppOrigin(normalized)) {
    return callback(null, true);
  }
  
  if (allowedOrigins.includes(normalized)) {
    return callback(null, true);
  }
  
  // For localhost, be permissive in development
  if (normalized.includes('localhost') || normalized.includes('127.0.0.1')) {
    return callback(null, true);
  }
  
  console.warn('[CORS] Rejected origin:', { origin, normalized, allowedOrigins });
  return callback(new Error('CORS blocked'), false);
};

// -----------------------------------------------------------------------------
// Copilot AI streaming helpers
// -----------------------------------------------------------------------------

const normalizeAiProvider = (provider) => {
  const p = String(provider || '').trim().toLowerCase();
  if (!p) return 'openai';
  if (p === 'openai' || p === 'gpt' || p === 'chatgpt') return 'openai';
  if (p === 'deepseek') return 'deepseek';
  if (p === 'gemini') return 'gemini';
  return p;
};

const streamOpenAIStyleResponse = async ({ url, apiKey, model, messages, onToken, signal }) => {
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.7, stream: true }),
    signal,
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`AI provider error (${resp.status}): ${errText || resp.statusText}`);
  }
  if (!resp.body) {
    throw new Error('AI provider returned empty body');
  }

  const nodeStream = Readable.fromWeb(resp.body);
  const decoder = new TextDecoder();
  let buffer = '';
  let output = '';

  for await (const chunk of nodeStream) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data) continue;
      if (data === '[DONE]') {
        return output;
      }
      try {
        const json = JSON.parse(data);
        const token = json?.choices?.[0]?.delta?.content;
        if (token) {
          output += token;
          if (typeof onToken === 'function') onToken(token);
        }
      } catch (_err) {
        // ignore malformed partial lines
      }
    }
  }
  return output;
};

const streamGeminiResponse = async ({ apiKey, model, messages, onToken, signal }) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: (messages || []).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: { temperature: 0.7 },
    }),
    signal,
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Gemini error (${resp.status}): ${errText || resp.statusText}`);
  }
  if (!resp.body) {
    throw new Error('Gemini returned empty body');
  }

  const nodeStream = Readable.fromWeb(resp.body);
  const decoder = new TextDecoder();
  let buffer = '';
  let output = '';

  for await (const chunk of nodeStream) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const token = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (token) {
          output += token;
          if (typeof onToken === 'function') onToken(token);
        }
      } catch (_err) {
        // ignore
      }
    }
  }
  return output;
};

const streamAIResponse = async ({ provider, messages, onToken, signal } = {}) => {
  const settings = await getCachedConfig();
  const effectiveProvider = normalizeAiProvider(provider || settings?.defaultProvider || 'openai');

  if (effectiveProvider === 'openai') {
    const apiKey = settings?.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OpenAI key not configured');
    const model = settings?.openaiModel || process.env.OPENAI_MODEL || 'gpt-4.1-mini';
    return streamOpenAIStyleResponse({
      url: 'https://api.openai.com/v1/chat/completions',
      apiKey,
      model,
      messages,
      onToken,
      signal,
    });
  }

  if (effectiveProvider === 'deepseek') {
    const apiKey = settings?.deepseekApiKey || process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error('DeepSeek key not configured');
    const model = settings?.deepseekModel || process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    return streamOpenAIStyleResponse({
      url: 'https://api.deepseek.com/v1/chat/completions',
      apiKey,
      model,
      messages,
      onToken,
      signal,
    });
  }

  if (effectiveProvider === 'gemini') {
    const apiKey = settings?.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Gemini key not configured');
    const model = settings?.geminiModel || process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    return streamGeminiResponse({ apiKey, model, messages, onToken, signal });
  }

  // Unknown provider: fall back to non-streaming.
  const out = await callAI({ provider: effectiveProvider, messages });
  const answer = String(out || '');
  if (answer && typeof onToken === 'function') onToken(answer);
  return answer;
};

app.use(
  cors({
    origin: allowOrigin,
    credentials: true,
  })
);
app.use(express.json());
// Serve uploaded assets (e.g., profile avatars)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/transcribe', transcribeRoutes);
app.use('/api/deepgram', deepgramRoutes);
app.use('/api/config', configRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/profile/resumes', resumeRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/copilot-sessions', copilotSessionRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/admin/content', adminContentRoutes);

// Minimal website-based auth flow for Chrome extension
app.use('/extension', extensionAuthRoutes);

// Raise maxHeaderSize because the SSE stream endpoint encodes the AI payload
// into the URL query string. Long resumes/job descriptions can otherwise trip
// the default (~16 KB) limit and yield 431 / connection resets.
const server = http.createServer(
  { maxHeaderSize: 200 * 1024 }, // 200 KB headroom
  app
);

const io = new Server(server, {
  cors: {
    origin: allowOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

io.use(async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token ||
      (socket.handshake.headers?.authorization?.startsWith('Bearer ')
        ? socket.handshake.headers.authorization.slice(7)
        : null);

    if (!token) {
      console.warn('[Socket.IO] Auth missing token', { 
        sid: socket.id, 
        origin: socket.handshake.headers?.origin,
        query: socket.handshake.query,
        auth: socket.handshake.auth
      });
      return next(new Error('UNAUTHORIZED: missing token'));
    }

    console.debug('[Socket.IO] Token received, verifying:', { sid: socket.id, tokenLength: token.length });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await UserModel.findById(decoded.userId || decoded.id).select('_id role active');

    if (!user || user.active === false) {
      console.warn('[Socket.IO] Auth failed - inactive or missing user', { sid: socket.id, uid: decoded.userId || decoded.id });
      return next(new Error('UNAUTHORIZED: user inactive'));
    }

    socket.data.userId = user._id.toString();
    socket.data.role = user.role;
    console.log('[Socket.IO] Auth successful - calling next():', { sid: socket.id, uid: user._id, role: user.role });
    return next();
  } catch (err) {
    console.error('[Socket.IO] Auth error:', err.message || err);
    return next(new Error('UNAUTHORIZED: invalid token'));
  }
});

// Register connection handler immediately after auth middleware
console.log('[Socket.IO] Registering connection handler');

const MEETING_TRANSCRIPT_FLUSH_MS = 2000;
const meetingTranscriptBuffers = new Map();

const flushMeetingTranscriptNow = async (meetingId, { forceStatus } = {}) => {
  const key = String(meetingId);
  const entry = meetingTranscriptBuffers.get(key);
  if (!entry || entry.chunks.length === 0) return;
  meetingTranscriptBuffers.delete(key);
  if (entry.timer) {
    clearTimeout(entry.timer);
  }

  const combined = entry.chunks.join('\n');

  try {
    const meeting = await Meeting.findById(key).select('transcript status');
    if (!meeting) return;
    const existingTranscript = meeting.transcript ? `${meeting.transcript}\n` : '';
    meeting.transcript = `${existingTranscript}${combined}`;
    if (forceStatus) {
      meeting.status = forceStatus;
    } else if (meeting.status !== 'COMPLETED') {
      meeting.status = 'IN_PROGRESS';
    }
    await meeting.save();
  } catch (err) {
    console.error('Failed to flush meeting transcript', err);
  }
};

const bufferMeetingTranscript = (meetingId, text) => {
  const key = String(meetingId);
  let entry = meetingTranscriptBuffers.get(key);
  if (!entry) {
    entry = { chunks: [], timer: null };
    meetingTranscriptBuffers.set(key, entry);
  }
  entry.chunks.push(text);
  if (!entry.timer) {
    entry.timer = setTimeout(() => flushMeetingTranscriptNow(key), MEETING_TRANSCRIPT_FLUSH_MS);
  }
};

// Background sweep to expire unused meetings and refund mentor credits
// if the host never joined.
const MEETING_EXPIRY_SWEEP_MS = 60 * 1000;
let meetingExpirySweepStarted = false;

const startMeetingExpirySweep = () => {
  if (meetingExpirySweepStarted) return;
  meetingExpirySweepStarted = true;

  setInterval(async () => {
    try {
      const now = new Date();
      const candidates = await Meeting.find({
        status: { $in: ['SCHEDULED', 'PENDING', 'APPROVED', 'IN_PROGRESS'] },
        expiresAt: { $lte: now },
      }).select('_id mentorId status mentorJoinedAt attendeeJoinedAt');

      if (!candidates || candidates.length === 0) return;

      // eslint-disable-next-line no-restricted-syntax
      for (const meeting of candidates) {
        const hostNeverJoined = !meeting.mentorJoinedAt;
        const meetingUsed = !!meeting.mentorJoinedAt;

        meeting.status = meetingUsed ? 'COMPLETED' : 'EXPIRED';
        // eslint-disable-next-line no-await-in-loop
        await meeting.save();
      }
    } catch (err) {
      console.error('Meeting expiry sweep failed', err);
    }
  }, MEETING_EXPIRY_SWEEP_MS).unref?.();
};

// Background sweep to expire unused interviews and refund AI credits
const INTERVIEW_EXPIRY_SWEEP_MS = 60 * 1000;
let interviewExpirySweepStarted = false;

const startInterviewExpirySweep = () => {
  if (interviewExpirySweepStarted) return;
  interviewExpirySweepStarted = true;

  setInterval(async () => {
    try {
      const now = new Date();
      const candidates = await Interview.find({
        status: { $in: ['SCHEDULED', 'PENDING', 'APPROVED', 'IN_PROGRESS'] },
        expiresAt: { $lte: now },
      }).select('_id userId status totalSessionSeconds');

      if (!candidates || candidates.length === 0) return;

      // eslint-disable-next-line no-restricted-syntax
      for (const interview of candidates) {
        const usedSeconds = Number(interview.totalSessionSeconds || 0);
        const wasUsed = usedSeconds > 0;

        interview.status = wasUsed ? 'COMPLETED' : 'EXPIRED';
        // eslint-disable-next-line no-await-in-loop
        await interview.save();
      }
    } catch (err) {
      console.error('Interview expiry sweep failed', err);
    }
  }, INTERVIEW_EXPIRY_SWEEP_MS).unref?.();
};

io.on('connection', (socket) => {
  console.log('[Socket.IO] New connection after auth:', { sid: socket.id, userId: socket.data.userId });
  // lightweight socket lifecycle handlers
  socket.on('error', (err) => {
    console.error('[Socket.IO] Socket error:', err);
  });
  // --- meeting socket handlers (kept from your original file) ---
  socket.on('join_meeting', async ({ meetingId, meetingKey }) => {
    if (!socket.data.userId) {
      socket.emit('meeting_error', { message: 'Unauthorized' });
      return;
    }
    const providedMeetingId = meetingId ? String(meetingId) : '';
    const providedKey = meetingKey ? String(meetingKey).trim().toUpperCase() : '';
    if (!providedMeetingId || !providedKey) {
      socket.emit('meeting_error', { message: 'Missing meeting reference' });
      return;
    }
    try {
      const meeting = await Meeting.findById(providedMeetingId).select(
        '_id mentorId meetingKey status attendeeId expiresAt mentorJoinedAt attendeeJoinedAt'
      );
      if (!meeting || meeting.meetingKey !== providedKey) {
        socket.emit('meeting_error', { message: 'Meeting not found or invalid key' });
        return;
      }

      // Basic expiry handling
      if (meeting.status === 'COMPLETED') {
        socket.emit('meeting_error', { message: 'Meeting already completed' });
        return;
      }
      if (meeting.status === 'EXPIRED') {
        socket.emit('meeting_error', { message: 'Meeting expired' });
        return;
      }
      if (meeting.expiresAt && Date.now() > new Date(meeting.expiresAt).getTime() && meeting.status !== 'COMPLETED') {
        meeting.status = 'EXPIRED';
        await meeting.save();
        socket.emit('meeting_error', { message: 'Meeting expired' });
        return;
      }

      const isMentor = meeting.mentorId?.toString() === socket.data.userId;

      // Enforce single-attendee lock at socket layer too (defense in depth)
      if (!isMentor) {
        if (meeting.attendeeId && meeting.attendeeId.toString() !== socket.data.userId) {
          socket.emit('meeting_error', { message: 'This key is already used by another user' });
          return;
        }
        if (!meeting.attendeeId) {
          meeting.attendeeId = socket.data.userId;
        }
        meeting.attendeeJoinedAt = meeting.attendeeJoinedAt || new Date();
      } else {
        meeting.mentorJoinedAt = meeting.mentorJoinedAt || new Date();
        if (['SCHEDULED', 'PENDING', 'APPROVED'].includes(meeting.status)) {
          meeting.status = 'IN_PROGRESS';
        }
      }

      await meeting.save();

      socket.join(providedMeetingId);
      socket.data.meetingPerm = { meetingId: providedMeetingId, isMentor };
      socket.emit('meeting_joined', {
        meetingId: meeting._id.toString(),
        meetingKey: meeting.meetingKey,
        status: meeting.status,
        isMentor,
      });
      socket.emit('meeting_status', { status: meeting.status });
    } catch (err) {
      console.error('Socket join error', err);
      socket.emit('meeting_error', { message: 'Failed to join meeting' });
    }
  });

  socket.on('meeting_transcript_chunk', async ({ meetingId, text }) => {
    const ctx = socket.data.meetingPerm;
    const targetMeetingId = meetingId ? String(meetingId) : ctx?.meetingId;
    if (!ctx || !targetMeetingId || ctx.meetingId !== targetMeetingId) {
      socket.emit('meeting_error', { message: 'Join the meeting first' });
      return;
    }
    if (!ctx.isMentor) {
      socket.emit('meeting_error', { message: 'Forbidden' });
      return;
    }
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (!trimmed) return;
    try {
      bufferMeetingTranscript(targetMeetingId, trimmed);
      // Broadcast to other participants (sender already has the line locally)
      socket.to(targetMeetingId).emit('meeting_transcript_chunk', {
        text: trimmed,
        timestamp: new Date().toISOString(),
        from: 'mentor',
      });
    } catch (err) {
      console.error('Failed to append transcript chunk', err);
    }
  });

  socket.on('meeting_status_update', async ({ meetingId, status }) => {
    const ctx = socket.data.meetingPerm;
    const targetMeetingId = meetingId ? String(meetingId) : ctx?.meetingId;
    const valid = new Set(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED', 'PENDING', 'APPROVED', 'REJECTED']);
    if (!ctx || !targetMeetingId || ctx.meetingId !== targetMeetingId) {
      socket.emit('meeting_error', { message: 'Join the meeting first' });
      return;
    }
    if (!ctx.isMentor) {
      socket.emit('meeting_error', { message: 'Forbidden' });
      return;
    }
    if (!status || !valid.has(status)) {
      socket.emit('meeting_error', { message: 'Invalid status' });
      return;
    }
    try {
      await Meeting.findByIdAndUpdate(targetMeetingId, { status });
      io.to(targetMeetingId).emit('meeting_status', { status });
    } catch (err) {
      console.error('Failed to update meeting status', err);
    }
  });

  // Live interim transcript for learners (word-by-word / token-by-token)
  socket.on('meeting_transcript_interim', ({ meetingId, text, timestamp, from }) => {
    const ctx = socket.data.meetingPerm;
    const targetMeetingId = meetingId ? String(meetingId) : ctx?.meetingId;
    if (!ctx || !targetMeetingId || ctx.meetingId !== targetMeetingId) {
      socket.emit('meeting_error', { message: 'Join the meeting first' });
      return;
    }
    if (!ctx.isMentor) {
      socket.emit('meeting_error', { message: 'Forbidden' });
      return;
    }
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (!trimmed) return;
    // Broadcast interim text to other participants (sender already has it locally)
    socket.to(targetMeetingId).emit('meeting_transcript_interim', {
      text: trimmed,
      timestamp: timestamp || new Date().toISOString(),
      from: from || 'mentor',
    });
  });

  socket.on('meeting_end', async ({ meetingId }) => {
    const ctx = socket.data.meetingPerm;
    const targetMeetingId = meetingId ? String(meetingId) : ctx?.meetingId;
    if (!ctx || !targetMeetingId || ctx.meetingId !== targetMeetingId) {
      socket.emit('meeting_error', { message: 'Join the meeting first' });
      return;
    }
    if (!ctx.isMentor) {
      socket.emit('meeting_error', { message: 'Forbidden' });
      return;
    }
    try {
      await flushMeetingTranscriptNow(targetMeetingId, { forceStatus: 'COMPLETED' });
      await Meeting.findByIdAndUpdate(targetMeetingId, { status: 'COMPLETED' });
      io.to(targetMeetingId).emit('meeting_status', { status: 'COMPLETED' });
      io.to(targetMeetingId).emit('meeting_end', { meetingId: targetMeetingId });
    } catch (err) {
      console.error('Failed to mark meeting completed', err);
    }
  });

// --- copilot session socket handlers (extension + console) ---
  const onCopilot = (names, handler) => {
    names.forEach((event) => socket.on(event, handler));
  };

  const emitCopilot = (eventBase, payload) => {
    socket.emit(`copilot_${eventBase}`, payload);
    socket.emit(`copilot:${eventBase}`, payload);
  };

  const broadcastCopilot = (room, eventBase, payload) => {
    io.to(room).emit(`copilot_${eventBase}`, payload);
    io.to(room).emit(`copilot:${eventBase}`, payload);
  };

  const broadcastCopilotToConsole = (room, eventBase, payload) => {
    const roomSockets = io.sockets.adapter.rooms.get(room);
    if (!roomSockets) return;
    roomSockets.forEach((sid) => {
      const s = io.sockets.sockets.get(sid);
      if (s?.data?.copilot?.deviceType === 'console') {
        s.emit(`copilot_${eventBase}`, payload);
        s.emit(`copilot:${eventBase}`, payload);
      }
    });
  };
  const broadcastCopilotToClients = (room, eventBase, payload) => {
    const roomSockets = io.sockets.adapter.rooms.get(room);
    if (!roomSockets) return;
    roomSockets.forEach((sid) => {
      const s = io.sockets.sockets.get(sid);
      const deviceType = s?.data?.copilot?.deviceType;
      if (deviceType === 'console' || deviceType === 'overlay') {
        s.emit(`copilot_${eventBase}`, payload);
        s.emit(`copilot:${eventBase}`, payload);
      }
    });
  };

  const getCopilotSessionId = (sessionId) => {
    const sid = sessionId || socket.data.copilot?.sessionId;
    return sid ? String(sid) : '';
  };

  const ensureCopilotJoined = (sid) => {
    if (!sid) {
      emitCopilot('error', { message: 'Missing sessionId' });
      return false;
    }
    if (!socket.data.copilot || socket.data.copilot.sessionId !== sid) {
      emitCopilot('error', { message: 'Join session first' });
      return false;
    }
    return true;
  };

  onCopilot(['copilot_join', 'copilot:join'], async ({ sessionId, joinCode, deviceType }) => {
    const sid = sessionId ? String(sessionId) : '';
    console.log('[copilot_join] Received event', { sid, joinCode, deviceType, userId: socket.data.userId });
    
    if (!sid) {
      console.warn('[copilot_join] Missing sessionId');
      emitCopilot('error', { message: 'Missing sessionId' });
      return;
    }
    if (!socket.data.userId) {
      console.warn('[copilot_join] Unauthorized - no userId');
      emitCopilot('error', { message: 'Unauthorized' });
      return;
    }
    try {
      const existing = await CopilotSession.findById(sid);
      if (!existing) {
        console.warn('[copilot_join] Session not found', { sid });
        emitCopilot('error', { message: 'Session not found' });
        return;
      }

      const isOwner = existing.ownerUserId?.toString() === socket.data.userId;
      const normalizedJoinCode = existing.joinCode ? String(existing.joinCode).toUpperCase() : null;
      const providedJoinCode = joinCode ? String(joinCode).toUpperCase() : null;

      if (!isOwner) {
        if (!normalizedJoinCode || !providedJoinCode || normalizedJoinCode !== providedJoinCode) {
          console.warn('[copilot_join] Invalid join code', { sid, isOwner, hasCode: !!normalizedJoinCode });
          emitCopilot('error', { message: 'Invalid join code' });
          return;
        }
      }

      socket.join(sid);
      socket.data.copilot = { sessionId: sid, isOwner, deviceType: deviceType || 'unknown' };

      const now = new Date();
      const existingDevices = Array.isArray(existing.connectedDevices) ? existing.connectedDevices : [];
      const filtered = existingDevices.filter((d) => d.socketId !== socket.id);
      const merged = filtered
        .concat([{ deviceType: socket.data.copilot.deviceType, socketId: socket.id, lastSeenAt: now }])
        .slice(-20);

      const updated = await CopilotSession.findByIdAndUpdate(
        sid,
        { $set: { connectedDevices: merged } },
        { new: true }
      );

      if (!updated) {
        console.warn('[copilot_join] Session not found after update', { sid });
        emitCopilot('error', { message: 'Session not found after update' });
        return;
      }

      console.log('[copilot_join] Successfully joined', { sid, isOwner, deviceType });
      emitCopilot('joined', {
        sessionId: updated._id,
        status: updated.status,
        title: updated.title,
        scenarioType: updated.scenarioType,
        targetUrl: updated.targetUrl,
        joinCode: isOwner ? updated.joinCode : undefined,
        isOwner,
      });

      emitCopilot('state', {
        transcript: updated.transcript || [],
        topics: updated.topics || [],
        aiMessages: updated.aiMessages || [],
      });

      if (deviceType === 'console') {
        const images = lastScreenshots.get(String(sid)) || [];
        if (images.length) {
          emitCopilot('capture_state', { images });
        }
      }

      broadcastCopilot(String(sid), 'presence', { count: (updated.connectedDevices || []).length });
    } catch (err) {
      console.error('[copilot_join] Error:', err.message, { sid, stack: err.stack });
      emitCopilot('error', { message: 'Failed to join session: ' + (err.message || 'Unknown error') });
    }
  });

  onCopilot(['copilot_transcript_chunk', 'copilot:transcript_chunk'], async ({ sessionId, text, source }) => {
    const sid = getCopilotSessionId(sessionId);
    if (!ensureCopilotJoined(sid)) return;
    if (!text) return;
    const trimmed = String(text).trim();
    if (!trimmed) return;
    try {
	      // Avoid VersionError by using an atomic update (no findById + save).
	      const now = new Date();
	      const src = source || 'extension';
	      await CopilotSession.updateOne(
	        { _id: sid },
	        { $push: { transcript: { text: trimmed, ts: now, source: src } } }
	      );
	      broadcastCopilot(sid, 'transcript_chunk', { text: trimmed, ts: now.toISOString(), source: src });
    } catch (err) {
      console.error('copilot_transcript_chunk error', err);
    }
  });

  onCopilot(['copilot_topic_event', 'copilot:topic_event'], async ({ sessionId, text }) => {
    const sid = getCopilotSessionId(sessionId);
    if (!ensureCopilotJoined(sid)) return;
    if (!text) return;
    const trimmed = String(text).trim();
    if (!trimmed) return;
    try {
	      // Avoid VersionError by using an atomic update (no findById + save).
	      const now = new Date();
	      await CopilotSession.updateOne(
	        { _id: sid },
	        { $push: { topics: { text: trimmed, ts: now } } }
	      );
	      broadcastCopilot(sid, 'topic_event', { text: trimmed, ts: now.toISOString() });
    } catch (err) {
      console.error('copilot_topic_event error', err);
    }
  });

  
  const runCodeFromScreenshots = async ({ sid, images, pending }) => {
    const provider = pending.provider || 'openai';
    const isOpenAI = String(provider || '').toLowerCase().includes('openai');
    const screenshotMsg = isOpenAI
      ? {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'Screenshots of a coding interview problem. Perform OCR on these images to extract the problem statement and any starter code. ' +
                'Identify the intended programming language from the screenshot (editor or code block) and produce a complete, working solution in that language. ' +
                'Return **Code** (one fenced code block) and then **Explanation** (a concise commentary: approach, key decisions, and time/space complexity). ' +
                'Use ONLY these images; ignore any stale or unrelated context.',
            },
            ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
          ],
        }
      : {
          role: 'user',
          content:
            'Latest screenshots of the coding problem (data URLs). Use OCR to extract the problem statement and any code snippets, ' +
            'detect the language shown, and return a complete solution in that language. ' +
            'Format your response as **Code** (one fenced code block) then **Explanation** (approach + complexity). Use only these images:\n' +
            images.map((u, i) => `[${i + 1}] ${u}`).join('\n'),
        };
    const messages = pending.messages.concat([screenshotMsg]);
    let answer = '';
    try {
      answer = await callAI({ provider, messages });
    } catch (err) {
      console.error('copilot_capture_upload AI failed', err);
      broadcastCopilotToClients(sid, 'ai_status', { status: 'error', type: 'CODE', message: err.message || 'AI failed' });
      pendingCodeRequests.delete(sid);
      return;
    }
    const now = new Date();
    await CopilotSession.updateOne(
      { _id: sid },
      {
        $push: {
          aiMessages: {
            type: 'CODE',
            role: 'assistant',
            content: answer,
            ts: now,
          },
        },
      }
    );
    broadcastCopilotToClients(sid, 'ai_response', { type: 'CODE', content: answer, ts: now.toISOString() });
    broadcastCopilotToClients(sid, 'ai_status', { status: 'done', type: 'CODE' });
    pendingCodeRequests.delete(sid);
  };

  onCopilot(['copilot_ai_request', 'copilot:ai_request'], async ({ sessionId, provider, messages, type }) => {
    const sid = getCopilotSessionId(sessionId);
    if (!ensureCopilotJoined(sid)) return;
    if (!Array.isArray(messages)) return;
    try {
      const effectiveType = type || 'HELP_ME';
      const effectiveProvider = effectiveType === 'CODE' ? 'openai' : provider;
      broadcastCopilotToClients(sid, 'ai_status', { status: 'running', type: effectiveType });

      // Enrich the prompt with any per-session context (resume, job description, keywords, etc.)
      let effectiveMessages = messages;
      try {
        const sess = await CopilotSession.findById(sid).select('scenarioType metadata').lean();
        const meta = sess?.metadata || {};
        const clamp = (s, max) => {
          const str = String(s || '');
          if (str.length <= max) return str;
          return `${str.slice(0, max)}\n...[truncated]`;
        };

        const contextBlocks = [];
        const kw = Array.isArray(meta.keywords) ? meta.keywords.filter(Boolean) : [];
        if (kw.length) contextBlocks.push(`Keywords: ${kw.slice(0, 50).join(', ')}`);
        if (meta.jobDescriptionText) contextBlocks.push(`Job Description:
${clamp(meta.jobDescriptionText, 6000)}`);
        if (meta.resumeText) contextBlocks.push(`Candidate Resume:
${clamp(meta.resumeText, 6000)}`);
        if (meta.additionalInfo) contextBlocks.push(`Additional Context:
${clamp(meta.additionalInfo, 2000)}`);

        if (contextBlocks.length) {
          const sys = {
            role: 'system',
            content: 'Session context (use this to tailor answers):\n\n' + contextBlocks.join('\n\n'),
          };
          effectiveMessages = [sys].concat(messages);
        }
      } catch (e) {
        // Non-fatal: fall back to the original messages.
      }

      // For CODE requests, use existing screenshots if available; otherwise queue until one arrives.
      if (effectiveType === 'CODE') {
        const pending = { provider: effectiveProvider || 'openai', messages: effectiveMessages };
        pendingCodeRequests.set(sid, pending);
        const existing = lastScreenshots.get(sid) || [];
        if (existing.length > 0) {
          await runCodeFromScreenshots({ sid, images: existing, pending });
          return;
        }
        broadcastCopilot(sid, 'capture_requested', { type: 'CODE' });
        return;
      }

      let answer = '';

      try {
        // Stream tokens to consoles + overlay.
        answer = await streamAIResponse({
          provider: effectiveProvider,
          messages: effectiveMessages,
          onToken: (token) => {
            if (!token) return;
            broadcastCopilotToClients(sid, 'ai_token', {
              type: effectiveType,
              token: String(token),
              ts: new Date().toISOString(),
            });
          },
        });
      } catch (streamErr) {
        // If streaming fails for any reason, fall back to the non-streaming implementation.
        console.error('copilot_ai_request streaming failed; falling back to non-streaming:', streamErr);
        const output = await callAI({
          provider: effectiveProvider,
          messages: effectiveMessages,
        });
        answer = String(output || '');
      }

      const now = new Date();

      await CopilotSession.updateOne(
        { _id: sid },
        {
          $push: {
            aiMessages: {
              type: effectiveType,
              role: 'assistant',
              content: answer,
              ts: now,
            },
          },
        }
      );

      broadcastCopilotToClients(sid, 'ai_response', { type: effectiveType, content: answer, ts: now.toISOString() });
      broadcastCopilotToClients(sid, 'ai_status', { status: 'done', type: effectiveType });
    } catch (err) {
      console.error('copilot_ai_request error', err);
      broadcastCopilotToClients(sid, 'ai_status', { status: 'error', type: type || 'HELP_ME', message: err.message || 'AI failed' });
    }
  });

  onCopilot(['copilot_end', 'copilot:end'], async ({ sessionId }) => {
    const sid = getCopilotSessionId(sessionId);
    if (!ensureCopilotJoined(sid)) return;
    if (!socket.data.copilot?.isOwner) {
      emitCopilot('error', { message: 'Forbidden' });
      return;
    }
    try {
      const session = await CopilotSession.findById(sid);
      if (!session) {
        emitCopilot('error', { message: 'Session not found' });
        return;
      }

      const linkedInterviewId = session?.metadata?.interviewId;
      let linkedInterview = null;
      if (linkedInterviewId) {
        linkedInterview = await Interview.findById(linkedInterviewId).select('durationMinutes status');
      }

      const endDate = new Date();
      if (!session.sessionStartedAt) {
        session.sessionStartedAt = endDate;
      }
      session.sessionEndedAt = endDate;
      session.status = 'ENDED';
      session.connectedDevices = [];
      session.joinCode = undefined;

      const { graceSeconds, hardStopEnabled } = await getBillingConfig();
      const durationMinutes = linkedInterview?.durationMinutes || 0;
      const elapsedSeconds = computeElapsedSeconds(
        session.sessionStartedAt,
        session.sessionEndedAt,
        durationMinutes,
        hardStopEnabled
      );
      session.totalSessionSeconds = elapsedSeconds;

      const billableSeconds = computeBillableSeconds(elapsedSeconds, graceSeconds);
      const billableMinutes = computeBillableMinutes(billableSeconds);
      const alreadyBilledMinutes = computeBillableMinutes(session.billedSeconds || 0);
      const newChargeMinutes = Math.max(0, billableMinutes - alreadyBilledMinutes);

      if (newChargeMinutes > 0) {
        const updatedUser = await UserModel.findOneAndUpdate(
          { _id: session.ownerUserId, 'wallet.aiInterviewCredits': { $gte: newChargeMinutes } },
          { $inc: { 'wallet.aiInterviewCredits': -newChargeMinutes } },
          { new: true }
        ).select('wallet');
        if (!updatedUser) {
          console.warn('Insufficient AI credits for copilot session', {
            sessionId: sid,
            minutes: newChargeMinutes,
          });
        } else {
          session.creditCharged = true;
        }
      }

      session.billedSeconds = Math.max(session.billedSeconds || 0, billableSeconds);

      if (!session.summaryUpdatedAt) {
        try {
          const summaryResult = await summarizeCopilotSession(session);
          if (summaryResult) {
            session.summaryText = summaryResult.summaryText;
            session.summaryData = summaryResult.summaryData;
            session.summaryUpdatedAt = new Date();
          }
        } catch (err) {
          console.warn('Failed to auto-generate copilot summary', err?.message || err);
        }
      }
      await session.save();

      // If this copilot session was started from a scheduled portal interview,
      // mark that interview as COMPLETED (used) so it never shows up as "Expired".
      //
      // IMPORTANT: "Expired" in the portal semantics means "never used".
      // Any usage via a copilot session should therefore be considered "Completed".
      try {
        if (linkedInterviewId) {
          await Interview.updateOne(
            { _id: linkedInterviewId },
            {
              $set: { status: 'COMPLETED' },
              // Ensure sessionSecondsUsed isn't 0 so the UI can reliably treat it as used.
              $max: { totalSessionSeconds: Math.max(1, elapsedSeconds) },
            }
          );
        }
      } catch (e) {
        console.warn('Failed to mark linked interview completed', e?.message || e);
      }
      broadcastCopilot(sid, 'end', { sessionId: sid, status: 'ENDED' });
      broadcastCopilot(sid, 'presence', { count: 0 });
    } catch (err) {
      console.error('copilot_end error', err);
    }
  });

  // When the extension uploads a screenshot, acknowledge and notify listeners.
  
  onCopilot(['copilot_capture_upload', 'copilot:capture_upload'], async ({ sessionId, type, image }) => {
    const sid = getCopilotSessionId(sessionId);
    if (!ensureCopilotJoined(sid)) return;
    if (!image) return;
    try {
      const existing = lastScreenshots.get(sid) || [];
      const nextShots = existing.concat(String(image)).slice(-6); // keep last 6
      lastScreenshots.set(sid, nextShots);
      broadcastCopilotToConsole(sid, 'capture_saved', {
        image: String(image),
        ts: new Date().toISOString(),
        count: nextShots.length,
      });
      const pending = pendingCodeRequests.get(sid);
      if (pending) {
        const images = lastScreenshots.get(sid) || [String(image)];
        await runCodeFromScreenshots({ sid, images, pending });
      } else {
        const effectiveType = type || 'SCREEN';
        broadcastCopilotToClients(sid, 'ai_response', {
          type: effectiveType,
          content: 'Screenshot saved. You can take more or press Code to generate a solution.',
          ts: new Date().toISOString(),
        });
        broadcastCopilotToClients(sid, 'ai_status', { status: 'done', type: effectiveType });
      }
    } catch (err) {
      console.error('copilot_capture_upload error', err);
    }
  });

  // Allow consoles to request a manual screenshot (for stitching multiple images).
  onCopilot(['copilot_screen_capture', 'copilot:screen_capture'], async ({ sessionId }) => {
    const sid = getCopilotSessionId(sessionId);
    if (!ensureCopilotJoined(sid)) return;
    broadcastCopilot(sid, 'capture_requested', { type: 'SCREEN' });
    broadcastCopilotToClients(sid, 'ai_status', { status: 'running', type: 'SCREEN' });
  });

  onCopilot(['copilot_clear_screens', 'copilot:clear_screens'], async ({ sessionId }) => {
    const sid = getCopilotSessionId(sessionId);
    if (!ensureCopilotJoined(sid)) return;
    lastScreenshots.delete(sid);
    pendingCodeRequests.delete(sid);
    broadcastCopilotToConsole(sid, 'capture_cleared', { ts: new Date().toISOString() });
  });

  socket.on('disconnect', async () => {
    const sid = socket.data.copilot?.sessionId;
    if (!sid) return;
    lastScreenshots.delete(String(sid));
    pendingCodeRequests.delete(String(sid));
    try {
      // Avoid VersionError by using an atomic update (no findById + save).
      const updated = await CopilotSession.findByIdAndUpdate(
        sid,
        { $pull: { connectedDevices: { socketId: socket.id } } },
        { new: true }
      );
      const count = (updated?.connectedDevices || []).length;
      broadcastCopilot(String(sid), 'presence', { count });
    } catch (err) {
      // ignore
    }
  });

});

let serverStarted = false;

// accept numeric PORT; fallback 4000
const port = Number.parseInt(process.env.PORT, 10) || 4000;
// optional HOST environment variable — if not set, Node will choose OS default.
// IMPORTANT: avoid forcing "0.0.0.0" on Windows if you had permission troubles
const host = process.env.HOST || undefined;

server.on('error', (err) => {
  if (err.syscall !== 'listen') {
    console.error('Server error:', err);
    process.exit(1);
  }

  const bind = typeof port === 'string' ? `Pipe ${port}` : `Port ${port}`;

  switch (err.code) {
    case 'EACCES':
      console.error(`${bind} requires elevated privileges (EACCES).`);
      console.error('Try running the process as Administrator or use a different PORT/HOST.');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(`${bind} is already in use (EADDRINUSE).`);
      console.error('Kill the other process or change PORT in your .env.');
      process.exit(1);
      break;
    default:
      console.error('Unexpected listen error:', err);
      process.exit(1);
  }
});

server.on('listening', () => {
  console.log(`Server listening on ${host || '0.0.0.0'}:${port}`);
});

const startServer = () => {
  if (serverStarted) return;
  serverStarted = true;

  // If host is undefined, Node will bind to all interfaces using platform default.
  // On Windows avoid explicitly using "0.0.0.0" if you had permission issues.
  if (host) {
    server.listen(port, host);
  } else {
    server.listen(port);
  }
};

// Start after mongoose connects
const ensureAdminAndStart = async () => {
  try {
    console.log('MongoDB connected — checking admin user...');

    const existingAdmin = await UserModel.findOne({ role: 'admin' });
    if (!existingAdmin) {
      // change these values before production
      const ADMIN_EMAIL = 'admin@admin.com';
      const ADMIN_PASSWORD = 'Admin@12345';

      // bcrypt hash (store in passwordHash per your schema)
      const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

      await UserModel.create({
        name: 'Super Admin',
        email: ADMIN_EMAIL,
        loginId: ADMIN_EMAIL,   // required by your schema
        passwordHash: passwordHash, // required by your schema
        role: 'admin',
        active: true,
        createdAt: new Date()
      });

      console.log('✔ Default admin created: %s / %s', ADMIN_EMAIL, ADMIN_PASSWORD);
      console.log('⚠ Remember to change the default password immediately (production).');
    } else {
      console.log('✔ Admin user already exists');
    }
  } catch (err) {
    console.error('Failed to ensure admin user:', err);
    // do not exit — still attempt to start the server
  } finally {
    // start background sweeps (safe to call multiple times)
    startMeetingExpirySweep();
    startInterviewExpirySweep();
    startServer();
  }
};

if (mongoose.connection.readyState === 1) {
  ensureAdminAndStart();
} else {
  mongoose.connection.once('connected', ensureAdminAndStart);
}

// graceful shutdown
const graceful = async () => {
  console.log('Shutting down server...');
  try {
    io.close();
    server.close(() => {
      console.log('HTTP server closed');
    });
    if (mongoose && mongoose.connection) {
      await mongoose.connection.close();
      console.log('MongoDB connection closed');
    }
    process.exit(0);
  } catch (err) {
    console.error('Error during graceful shutdown', err);
    process.exit(1);
  }
};

process.on('SIGINT', graceful);
process.on('SIGTERM', graceful);
