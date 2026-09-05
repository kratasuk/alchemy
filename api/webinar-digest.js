// Сводка регистраций за сутки одним сообщением в Telegram.
//
// Вместо уведомления на каждую регистрацию команда получает одно сообщение
// в конце дня: сколько человек записалось за сутки, сколько дошло до бота,
// и проценты по каждой категории анкеты. Запускается по расписанию Vercel,
// вручную можно дёрнуть с ключом: /api/webinar-digest?key=<TG_WEBHOOK_SECRET>.

import { listRegistrations, skvConfigured } from './_skv.js';
import { EVENT, EVENT_TITLE } from './_event.js';

const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_GROUP_CHAT_ID = process.env.TG_GROUP_CHAT_ID;
const TG_WEBHOOK_SECRET = process.env.TG_WEBHOOK_SECRET;
const CRON_SECRET = process.env.CRON_SECRET;

// Vercel зовёт крон без заголовка x-vercel-cron: у node-функции в запросе
// только user-agent «vercel-cron/1.0» и, если задан CRON_SECRET, заголовок
// Authorization. Проверка по одному x-vercel-cron отбивала свой же крон 401-м,
// и сводка за 04.09 не ушла. Принимаем все три признака.
function isVercelCron(req) {
  if (req.headers['x-vercel-cron']) return true;
  if (/vercel-cron/i.test(String(req.headers['user-agent'] || ''))) return true;
  if (CRON_SECRET && req.headers.authorization === `Bearer ${CRON_SECRET}`) return true;
  return false;
}

// Порядок вариантов внутри категории не важен: сортируем по убыванию.
const CATEGORIES = [
  ['age', 'Возраст', { under_35: 'До 35', '35_40': '35–40', '40_45': '40–45', '45_50': '45–50', '50_plus': '50 и больше' }],
  ['gap', 'Главный разрыв', { body: 'Тело и энергия', money: 'Деньги и реализация', relations: 'Отношения' }],
  ['energy', 'Энергия за год', { burnout: 'Сильное истощение', low: 'Ниже среднего', mid: 'Средне', good: 'Выше среднего', high: 'Высокий' }],
  ['prof', 'Занятие', { top: 'Руководитель', manager: 'Специалист', owner: 'Свой бизнес', expert: 'Частная практика', transition: 'В переходе', family: 'Фокус на семье' }],
  ['income', 'Доход', { under_100: 'Меньше 100 тысяч', '100_300': '100–300 тысяч', '300_1m': '300 тысяч – 1 миллион', '1_3m': '1–3 миллиона', '3m_plus': 'Больше 3 миллионов' }],
  ['relations', 'Личная жизнь', { married_good: 'В браке, хорошо', married_issues: 'В браке, напряжение', single_choice: 'Одна по выбору', single_seeking: 'Ищет близкого человека', recent_split: 'Недавнее расставание' }],
  ['family', 'Дети', { kids_small: 'До 7 лет', kids_school: 'Школьники', kids_adult: 'Взрослые', no_kids: 'Детей нет', considering: 'Ждёт или планирует' }]
];

const WORK_PAIN = { low_income: 'Зарабатываю меньше, чем могла бы', overwork: 'Работаю на износ', role_ceiling: 'Потолок роли', operational_lock: 'Всё держится на мне', meaning_lost: 'Не вижу смысла', not_relevant: 'Работа не актуальна' };

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function share(count, total) {
  return total ? Math.round((count / total) * 100) : 0;
}

/** Считает сводку. Вынесено отдельно, чтобы проверять на живых данных без отправки. */
export function buildDigest(regs, sinceMs) {
  const day = regs.filter((r) => {
    const t = Date.parse(r.ts || '');
    return Number.isFinite(t) && t >= sinceMs;
  });
  const total = day.length;
  const confirmed = day.filter((r) => r.status === 'confirmed').length;

  const blocks = [];
  for (const [field, title, labels] of CATEGORIES) {
    const counts = new Map();
    day.forEach((r) => { if (r[field]) counts.set(r[field], (counts.get(r[field]) || 0) + 1); });
    if (!counts.size) continue;
    const rows = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([v, n]) => `  ${labels[v] || v} – ${share(n, total)}% (${n})`);
    blocks.push(`<b>${title}</b>\n${rows.join('\n')}`);
  }

  // Сложности в работе: до двух ответов на человека, процент считаем от людей.
  const painCounts = new Map();
  day.forEach((r) => {
    String(r.work_pain || '').split(' ').filter(Boolean).forEach((v) => painCounts.set(v, (painCounts.get(v) || 0) + 1));
  });
  if (painCounts.size) {
    const rows = [...painCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([v, n]) => `  ${WORK_PAIN[v] || v} – ${share(n, total)}% (${n})`);
    blocks.push(`<b>Сложности в работе</b>\n${rows.join('\n')}`);
  }

  return { total, confirmed, allTime: regs.length, blocks };
}

function formatMessage(d) {
  if (!d.total) {
    return `📊 <b>${EVENT_TITLE}</b>: за сутки регистраций нет. Всего: ${d.allTime}.`;
  }
  const head = `📊 <b>Регистрации на ${EVENT_TITLE}</b>

За сутки: <b>${d.total}</b> · дошли до бота: ${d.confirmed} · всего: ${d.allTime}`;
  return [head, ...d.blocks].join('\n\n');
}

async function sendTgMessage(chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true })
  });
  if (!res.ok) throw new Error(`TG sendMessage failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export default async function handler(req, res) {
  const fromCron = isVercelCron(req);
  const key = req.query?.key;
  if (!fromCron && (!TG_WEBHOOK_SECRET || key !== TG_WEBHOOK_SECRET)) {
    // Печатаем user-agent (не секрет), чтобы отказ крону было видно в логах.
    console.warn('webinar-digest: отказ, ua=', String(req.headers['user-agent'] || '–'));
    return res.status(401).json({ ok: false, error: 'Нужен ключ' });
  }
  if (!skvConfigured()) return res.status(500).json({ ok: false, error: 'SKV_API_KEY не задан' });

  try {
    const regs = await listRegistrations({ event: EVENT });
    const digest = buildDigest(regs, Date.now() - 24 * 60 * 60 * 1000);
    const text = formatMessage(digest);

    let sent = false;
    if (TG_GROUP_CHAT_ID && req.query?.dry !== '1') {
      await sendTgMessage(TG_GROUP_CHAT_ID, text);
      sent = true;
    }
    return res.status(200).json({ ok: true, sent, total: digest.total, confirmed: digest.confirmed, allTime: digest.allTime });
  } catch (err) {
    console.error('webinar-digest error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
