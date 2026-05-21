// TEMPORARY diagnostic — DELETE after debugging.
// Reports whether the Telegram webhook is correctly configured.
// Usage: GET /api/tg-diag?key=<TG_WEBHOOK_SECRET>
//   (uses the webhook secret as the diag access key so we don't expose it publicly)

export default async function handler(req, res) {
  const key = (req.query?.key || '').toString();
  if (!process.env.TG_WEBHOOK_SECRET || key !== process.env.TG_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'forbidden' });
  }

  const token = process.env.TG_BOT_TOKEN || '';
  const out = {
    env: {
      TG_BOT_TOKEN_len: token.length,
      TG_BOT_TOKEN_prefix: token.slice(0, 6),
      TG_WEBHOOK_SECRET_set: !!process.env.TG_WEBHOOK_SECRET,
      TG_GROUP_CHAT_ID_set: !!process.env.TG_GROUP_CHAT_ID,
      TG_BOT_USERNAME: process.env.TG_BOT_USERNAME || null
    }
  };

  if (!token) {
    return res.status(200).json({ ...out, note: 'TG_BOT_TOKEN missing in lambda env' });
  }

  try {
    const me = await fetch(`https://api.telegram.org/bot${token}/getMe`).then((r) => r.json());
    out.getMe = me;
  } catch (e) {
    out.getMe_error = e.message;
  }

  try {
    const wh = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`).then((r) => r.json());
    out.getWebhookInfo = wh;
  } catch (e) {
    out.getWebhookInfo_error = e.message;
  }

  return res.status(200).json(out);
}
