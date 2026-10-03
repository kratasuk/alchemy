// Рассылка в бот Алхимии всем, кто подтвердил запись на событие.
//
// Текст и разрешение живут в SKV, а не в запросе: узел `broadcast.<id>` в дереве
// alchemy, поля `text`, `event`, `status`. Поэтому вызов без ключа безопасен:
// он может только дослать уже утверждённое сообщение, и каждому не больше
// одного раза (кто уже получил, отмечено в Redis множеством bc:<id>:sent).
//
//   status = test  → только в чат команды (TG_GROUP_CHAT_ID), для проверки вида
//   status = go    → всем подтвердившим регистрацию на `event`, порциями
//   любой другой   → ничего не отправляем
//
// Один вызов шлёт до BATCH человек со скоростью ниже лимита Telegram и
// отвечает, сколько осталось. Зовём повторно, пока `left` не станет 0.
// Итоги пишутся обратно в узел: sent, failed, left, finished.

import { Redis } from '@upstash/redis';
import { listRegistrations, readNode, patchNode, skvConfigured } from './_skv.js';

export const config = { maxDuration: 60 };

const redis = Redis.fromEnv();
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_GROUP_CHAT_ID = process.env.TG_GROUP_CHAT_ID;

const BATCH = 700;
const PER_SECOND = 20; // лимит Telegram около 30 в секунду на бота
const TIME_BUDGET_MS = 48000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sendTg(chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: false })
  });
  return res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
}

export default async function handler(req, res) {
  const id = String(req.query?.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!id) return res.status(400).json({ error: 'нет id' });
  if (!skvConfigured() || !TG_BOT_TOKEN) return res.status(500).json({ error: 'не настроено' });

  const key = `broadcast.${id}`;
  const bc = await readNode({ key });
  if (!bc?.text) return res.status(404).json({ error: 'рассылки нет' });

  if (bc.status === 'test') {
    const r = await sendTg(TG_GROUP_CHAT_ID, bc.text);
    return res.status(200).json({ mode: 'test', ok: Boolean(r.ok), error: r.ok ? undefined : r.description });
  }
  if (bc.status !== 'go') return res.status(200).json({ mode: bc.status || 'none', sent: 0 });

  const regs = await listRegistrations({ event: bc.event });
  const ids = [...new Set(regs.map((r) => r.tg_id).filter(Boolean))];
  const sentSet = `bc:${id}:sent`;
  const failHash = `bc:${id}:failed`;
  const done = new Set((await redis.smembers(sentSet)).map(String));
  const todo = ids.filter((t) => !done.has(String(t))).slice(0, BATCH);

  const started = Date.now();
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < todo.length; i += PER_SECOND) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const tick = Date.now();
    const chunk = todo.slice(i, i + PER_SECOND);
    await Promise.all(chunk.map(async (chatId) => {
      // Сначала занимаем место в множестве: параллельный вызов этого человека
      // уже не возьмёт. Лучше недослать одному, чем прислать дважды.
      if (!(await redis.sadd(sentSet, String(chatId)))) return;
      let r = await sendTg(chatId, bc.text);
      if (!r.ok && r.parameters?.retry_after) {
        await sleep((r.parameters.retry_after + 1) * 1000);
        r = await sendTg(chatId, bc.text);
      }
      if (r.ok) sent++;
      else {
        failed++;
        await redis.hset(failHash, { [chatId]: String(r.description || 'error').slice(0, 120) });
      }
    }));
    const wait = 1000 - (Date.now() - tick);
    if (wait > 0) await sleep(wait);
  }

  const total = ids.length;
  const delivered = await redis.scard(sentSet);
  const failedTotal = await redis.hlen(failHash);
  const left = Math.max(0, total - delivered);
  const now = new Date().toISOString();
  await patchNode({
    key,
    fields: {
      total, sent: delivered - failedTotal, failed: failedTotal, left, updated: now,
      ...(left === 0 ? { finished: now, status: 'done' } : {})
    }
  }).catch((e) => console.error('broadcast patch failed:', e?.message || e));

  return res.status(200).json({ mode: 'go', total, this_call: { sent, failed }, delivered_or_tried: delivered, failed_total: failedTotal, left });
}
