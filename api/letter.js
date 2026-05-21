import { Redis } from '@upstash/redis';
import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT, describeAnketa } from './_letter.js';

export const config = { maxDuration: 60 };

const redis = Redis.fromEnv();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function sse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

// Append the generated letter as content blocks inside the Notion card
// that /api/submit created for this submission. Looked up by token →
// page id mapping stored in Redis at submit time. Best-effort: failures
// are logged but don't disrupt the SSE response.
async function appendLetterToNotion(token, fullText) {
  if (!process.env.NOTION_TOKEN) return;

  let pageId;
  try {
    pageId = await redis.get(`notion-page:${token}`);
  } catch (e) {
    console.error('redis read notion-page failed:', e.message);
    return;
  }
  if (!pageId) return;

  const paragraphs = String(fullText || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!paragraphs.length) return;

  const children = [
    {
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: 'Персональный разбор' } }]
      }
    },
    ...paragraphs.map((p) => ({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ type: 'text', text: { content: p.slice(0, 2000) } }]
      }
    }))
  ];

  try {
    const response = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ children })
    });
    if (!response.ok) {
      const errBody = await response.text();
      console.error('Notion letter append failed:', response.status, errBody.slice(0, 500));
    }
  } catch (e) {
    console.error('Notion letter append exception:', e.message);
  }
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

  let fullText = '';
  try {
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      // Adaptive thinking: model decides when/how much to think before writing.
      // For diagnostic letters this materially improves specificity (mechanism
      // identification, scene concreteness) at the cost of ~5-15s extra
      // time-to-first-token. Acceptable for premium UX with the streaming
      // cursor; the 10s heartbeat keeps the SSE proxy from timing out.
      // max_tokens raised to 4000 to leave room for thinking tokens above the
      // 600-word letter ceiling.
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userText }]
    });

    stream.on('text', (delta) => {
      const safe = delta.replace(/—/g, '–');
      fullText += safe;
      sse(res, { type: 'text', text: safe });
    });

    await stream.finalMessage();
    sse(res, { type: 'done' });

    // Push the completed letter into the matching Notion card. Awaited so
    // the lambda doesn't terminate the in-flight request. Usually <1s.
    await appendLetterToNotion(token, fullText);
  } catch (err) {
    console.error('letter stream failed:', err?.message || err);
    sse(res, { type: 'error', message: 'generation_failed' });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
}
