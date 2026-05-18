import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_WEBHOOK_SECRET = process.env.TG_WEBHOOK_SECRET;

const ARCHETYPES = {
  1: 'Руководите командой',
  2: 'Развиваете свой бизнес',
  3: 'Реализованы, но одиноки',
  4: 'Наставник для других',
  5: 'Совмещаете семью и работу',
  6: 'Выходите на новый виток'
};

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

async function sendTgMessage(chatId, text, opts = {}) {
  const res = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...opts
    })
  });
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).end();

  if (TG_WEBHOOK_SECRET) {
    const got = req.headers['x-telegram-bot-api-secret-token'];
    if (got !== TG_WEBHOOK_SECRET) {
      console.warn('TG webhook: bad secret token');
      return res.status(401).end();
    }
  }

  const update = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const msg = update?.message;
  if (!msg?.text || msg.chat?.type !== 'private') return res.status(200).end();

  if (!msg.text.startsWith('/start')) {
    return res.status(200).end();
  }

  const parts = msg.text.split(/\s+/);
  const token = parts[1]?.trim();

  if (!token) {
    await sendTgMessage(
      msg.chat.id,
      'Привет! Похоже, вы открыли бота напрямую. Чтобы пройти тест «Алхимия Женщины» — откройте <a href="https://wmnalchemy.com/test.html">эту страницу</a>, а после результата вернётесь сюда автоматически.'
    );
    return res.status(200).end();
  }

  const raw = await redis.get(`anketa:${token}`);
  if (!raw) {
    await sendTgMessage(
      msg.chat.id,
      'Похоже, ссылка устарела. <a href="https://wmnalchemy.com/test.html">Пройдите тест заново</a> — мы свяжемся в течение часа.'
    );
    return res.status(200).end();
  }

  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const name = escapeHtml(data.answers?.contact?.name || 'привет');
  const arch = escapeHtml(ARCHETYPES[data.archetypeId] || 'Архетип');

  const greeting = `Привет, <b>${name}</b>! 👋

Лиза получила вашу анкету.
<b>Архетип:</b> ${arch}

Менеджер Ольга свяжется с вами в течение часа — здесь или напишет в личку.

Если хотите задать вопрос прямо сейчас — пишите сюда, мы передадим.`;

  await sendTgMessage(msg.chat.id, greeting);
  return res.status(200).end();
}
