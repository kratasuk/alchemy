// Проверка последнего звена регистрации: доставляет ли Telegram обновления боту.
//
// Отправлять сообщения бот может всегда (это исходящий вызов), а вот отвечать на
// /start он будет только если у бота прописан вебхук на наш адрес. Если вебхук
// сбился, человек нажимает кнопку в анкете, попадает в бот и не получает ничего.
//
// Эндпойнт читает состояние и, если вебхук указывает не на нас, чинит его сам.
// Секретов в ответе нет: только наш публичный адрес, счётчик очереди и текст
// последней ошибки от Telegram.

const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_WEBHOOK_SECRET = process.env.TG_WEBHOOK_SECRET;
const WEBHOOK_URL = 'https://wmnalchemy.com/api/telegram-webhook';

async function tg(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex');
  if (!TG_BOT_TOKEN) return res.status(500).json({ ok: false, error: 'TG_BOT_TOKEN не задан' });

  try {
    const me = await tg('getMe');
    let info = await tg('getWebhookInfo');
    let fixed = false;

    if (info?.result?.url !== WEBHOOK_URL) {
      const set = await tg('setWebhook', {
        url: WEBHOOK_URL,
        secret_token: TG_WEBHOOK_SECRET || undefined,
        allowed_updates: ['message'],
        drop_pending_updates: false
      });
      fixed = Boolean(set?.ok);
      info = await tg('getWebhookInfo');
    }

    const w = info?.result || {};
    return res.status(200).json({
      ok: true,
      bot: me?.result?.username || null,
      secret_configured: Boolean(TG_WEBHOOK_SECRET),
      webhook: {
        url: w.url || '(не задан)',
        expected: WEBHOOK_URL,
        matches: w.url === WEBHOOK_URL,
        pending_updates: w.pending_update_count ?? null,
        last_error: w.last_error_message || null,
        last_error_at: w.last_error_date ? new Date(w.last_error_date * 1000).toISOString() : null
      },
      fixed
    });
  } catch (err) {
    console.error('tg-status error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
