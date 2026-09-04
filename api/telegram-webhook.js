import { Redis } from '@upstash/redis';
import { linkTelegram, skvConfigured, SKV_TREE } from './_skv.js';

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

/**
 * Человек пришёл из анкеты вебинара. Здесь мы впервые узнаём его телеграм –
 * записываем карточку в SKV (это и есть база для рассылки) и подтверждаем запись.
 */
async function handleWebinarStart(msg, token, raw, res) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const name = escapeHtml(data.fields?.name || data.answers?.name || 'друзья');
  const tg = {
    id: msg.chat.id,
    username: msg.chat.username || msg.from?.username || '',
    first_name: msg.chat.first_name || msg.from?.first_name || ''
  };

  if (skvConfigured()) {
    try {
      await linkTelegram({ event: data.event, token, tg, fields: data.fields || {} });
    } catch (err) {
      console.error('SKV linkTelegram failed:', err?.message || err);
      await redis
        .lpush('skv-outbox', JSON.stringify({ tree: SKV_TREE, kind: 'link', event: data.event, token, tg, fields: data.fields || {} }))
        .catch(() => {});
    }
  }

  await sendTgMessage(
    msg.chat.id,
    `Поздравляем, <b>${name}</b>! Вы зарегистрировались на вебинар <b>«Как расцвести после 40»</b>.
Он пройдёт 3 октября (суббота) в 10:00 по МСК.

Ссылку на эфир пришлю сюда за день и за час до начала.`
  );
  return res.status(200).end();
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
      'Привет! Похоже, вы открыли бота напрямую. Чтобы пройти тест «Алхимия Женщины» – откройте <a href="https://wmnalchemy.com/test.html">эту страницу</a>, а после результата вернётесь сюда автоматически.'
    );
    return res.status(200).end();
  }

  // Токен вебинара начинается на w, но и токен анкеты Алхимии может – поэтому
  // решаем не по префиксу, а по тому, какие данные реально нашлись.
  const isWebinar = token.startsWith('w');
  const webinarRaw = isWebinar ? await redis.get(`webinar:${token}`) : null;
  if (webinarRaw) {
    return handleWebinarStart(msg, token, webinarRaw, res);
  }

  const raw = await redis.get(`anketa:${token}`);
  if (!raw) {
    await sendTgMessage(
      msg.chat.id,
      isWebinar
        ? 'Похоже, ссылка устарела. <a href="https://wmnalchemy.com/webinar">Зарегистрируйтесь заново</a>, это минута.'
        : 'Похоже, ссылка устарела. <a href="https://wmnalchemy.com/test.html">Пройдите тест заново</a> – мы свяжемся в течение часа.'
    );
    return res.status(200).end();
  }

  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const name = escapeHtml(data.answers?.contact?.name || 'друзья');

  const greeting = `Добрый день, <b>${name}</b>! 👋

Мы получили вашу анкету.

<b>Ольга</b> – наш руководитель службы поддержки, напишет вам в ближайшее время.

Но если есть срочный вопрос – можно сразу написать ей напрямую: <a href="https://t.me/Olga_Turova">@Olga_Turova</a>`;

  await sendTgMessage(msg.chat.id, greeting);
  return res.status(200).end();
}
