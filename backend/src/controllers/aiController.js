const { callAI } = require('../services/aiProvider');
const { getCachedConfig } = require('../services/adminConfigCache');
const jwt = require('jsonwebtoken');
const { Readable } = require('stream');

const generateResponse = async (req, res) => {
    const { provider, messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'messages array required' });
    }
    try {
        const output = await callAI({ provider, messages });
        res.json({ output });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'AI generation failed', detail: err.message });
    }
};

const streamResponse = async (req, res) => {
    const extractToken = () => {
        if (req.headers.authorization) {
            const [type, token] = req.headers.authorization.split(' ');
            if (type === 'Bearer' && token) return token;
        }
        if (req.query.token) return req.query.token;
        return null;
    };

    const token = extractToken();
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
    }

    const rawPayload = req.query.payload;
    if (!rawPayload) {
        return res.status(400).json({ error: 'Missing payload' });
    }

    let payload;
    try {
        const decoded = Buffer.from(decodeURIComponent(rawPayload), 'base64').toString('utf-8');
        payload = JSON.parse(decoded);
    } catch (err) {
        console.error('Failed to parse stream payload', err);
        return res.status(400).json({ error: 'Invalid payload' });
    }

    if (!Array.isArray(payload.messages)) {
        return res.status(400).json({ error: 'messages array required' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    req.socket?.setTimeout(0);

    let aborted = false;
    const controller = new AbortController();
    req.on('close', () => {
        aborted = true;
        controller.abort();
    });

    try {
        const settings = await getCachedConfig();
        const configuredDefault = settings?.defaultProvider || 'openai';
        const effectiveProvider = (payload.provider || configuredDefault || 'openai').toLowerCase();

        const sendErrorEvent = (message) => {
            if (!res.writableEnded) {
                res.write(`data: ${JSON.stringify(`[ERROR] ${message}`)}\n\n`);
                res.end();
            }
            return;
        };

        if (!['openai', 'deepseek', 'gemini'].includes(effectiveProvider)) {
            sendErrorEvent(`Streaming not supported for provider: ${effectiveProvider}`);
            return;
        }

        if (effectiveProvider === 'openai') {
            const apiKey = settings?.openaiApiKey || process.env.OPENAI_API_KEY;
            if (!apiKey) {
                sendErrorEvent('OpenAI key missing');
                return;
            }
            const model = settings?.openaiModel || 'gpt-4.1-mini';

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    messages: payload.messages,
                    stream: true
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                const errorBody = await response.text().catch(() => '');
                sendErrorEvent(`OpenAI returned ${response.status} ${errorBody}`);
                return;
            }

            if (!response.body) {
                sendErrorEvent('OpenAI stream unavailable');
                return;
            }

            const nodeStream = Readable.fromWeb(response.body);
            const decoder = new TextDecoder();

            for await (const chunk of nodeStream) {
                if (aborted || res.writableEnded) break;
                // OpenAI chunks are separate lines starting with data:
                const decodedChunk = decoder.decode(chunk, { stream: true });
                const lines = decodedChunk.split('\n').filter(line => line.trim() !== '');

                for (const line of lines) {
                    if (line.includes('[DONE]')) continue;
                    if (line.startsWith('data: ')) {
                        const jsonStr = line.replace('data: ', '');
                        try {
                            const parsed = JSON.parse(jsonStr);
                            const content = parsed.choices?.[0]?.delta?.content || '';
                            if (content) {
                                res.write(`data: ${JSON.stringify(content)}\n\n`);
                            }
                        } catch (e) {
                            // console.error('Error parsing token', e);
                        }
                    }
                }
            }
        } else if (effectiveProvider === 'deepseek') {
            const apiKey = settings?.deepseekApiKey || process.env.DEEPSEEK_API_KEY;
            if (!apiKey) {
                sendErrorEvent('DeepSeek key missing');
                return;
            }
            const model = settings?.deepseekModel || 'deepseek-chat';

            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    messages: payload.messages,
                    stream: true
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                const errorBody = await response.text().catch(() => '');
                sendErrorEvent(`DeepSeek returned ${response.status} ${errorBody}`);
                return;
            }

            if (!response.body) {
                sendErrorEvent('DeepSeek stream unavailable');
                return;
            }

            const nodeStream = Readable.fromWeb(response.body);
            const decoder = new TextDecoder();

            for await (const chunk of nodeStream) {
                if (aborted || res.writableEnded) break;
                const decodedChunk = decoder.decode(chunk, { stream: true });
                const lines = decodedChunk.split('\n').filter(line => line.trim() !== '');

                for (const line of lines) {
                    if (line.includes('[DONE]')) continue;
                    if (line.startsWith('data: ')) {
                        const jsonStr = line.replace('data: ', '');
                        try {
                            const parsed = JSON.parse(jsonStr);
                            const content = parsed.choices?.[0]?.delta?.content || '';
                            if (content) {
                                res.write(`data: ${JSON.stringify(content)}\n\n`);
                            }
                        } catch (e) {
                            // console.error('Error parsing token', e);
                        }
                    }
                }
            }

        } else if (effectiveProvider === 'gemini') {
            const apiKey = settings?.geminiApiKey || process.env.GEMINI_API_KEY;
            if (!apiKey) {
                sendErrorEvent('Gemini key missing');
                return;
            }
            const model = settings?.geminiModel || 'gemini-2.0-flash';

            const prompt = payload.messages
                .map((m) => `${String(m.role || '').toUpperCase()}: ${m.content}`)
                .join('\n');

            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }]
                    }),
                    signal: controller.signal
                }
            );

            if (!response.ok) {
                const errorBody = await response.text().catch(() => '');
                sendErrorEvent(`Gemini returned ${response.status} ${errorBody}`);
                return;
            }

            if (!response.body) {
                sendErrorEvent('Gemini stream unavailable');
                return;
            }

            const nodeStream = Readable.fromWeb(response.body);
            const decoder = new TextDecoder();
            let buffer = '';

            for await (const chunk of nodeStream) {
                if (aborted || res.writableEnded) break;
                buffer += decoder.decode(chunk, { stream: true });

                let newlineIndex;
                while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.slice(0, newlineIndex).trim();
                    buffer = buffer.slice(newlineIndex + 1);
                    if (!line) continue;

                    let parsed;
                    try {
                        parsed = JSON.parse(line);
                    } catch (e) {
                        console.error('Failed to parse Gemini stream chunk', e);
                        continue;
                    }

                    const text =
                        parsed?.candidates?.[0]?.content?.parts?.[0]?.text ||
                        parsed?.candidates?.[0]?.output ||
                        '';

                    if (typeof text === 'string' && text.length > 0) {
                        res.write(`data: ${JSON.stringify(text)}\n\n`);
                    }
                }
            }
        }

        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify('[DONE]')}\n\n`);
            res.end();
        }
    } catch (err) {
        if (err?.name === 'AbortError' || aborted) {
            return;
        }
        console.error('AI stream error', err);
        const message = err?.message || 'Stream failed';
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify(`[ERROR] ${message}`)}\n\n`);
            res.end();
        }
    }
};

module.exports = {
    generateResponse,
    streamResponse
};
