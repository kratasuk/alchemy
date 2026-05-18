import { Redis } from '@upstash/redis';
import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT, describeAnketa } from './_letter.js';

export const config = { maxDuration: 60 };

const redis = Redis.fromEnv();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function sse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export default async function handler(req, res) {
  const token = (req.query?.token || '').toString().trim();
  if (!token) {
    return res.status(400).json({ error: 'token required' });
  }

  let stored;
  try {
    stored = await redis.get(`anketa:${token}`);
  } catch (e) {
    return res.status(500).json({ error: 'redis read failed' });
  }
  if (!stored) {
    return res.status(404).json({ error: 'anketa not found or expired' });
  }
  const { answers, archetypeId } = typeof stored === 'string' ? JSON.parse(stored) : stored;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'letter generation not configured' });
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Heartbeat so proxies don't close the connection during slow first token.
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch {}
  }, 10000);

  const userText = describeAnketa(answers, archetypeId) +
    '\n\nНапишите ей письмо-результат по правилам.';

  try {
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userText }]
    });

    stream.on('text', (delta) => {
      const safe = delta.replace(/—/g, '–');
      sse(res, { type: 'text', text: safe });
    });

    await stream.finalMessage();
    sse(res, { type: 'done' });
  } catch (err) {
    console.error('letter stream failed:', err?.message || err);
    sse(res, { type: 'error', message: 'generation_failed' });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
}
