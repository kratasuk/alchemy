import { Redis } from '@upstash/redis';
import crypto from 'node:crypto';

const redis = Redis.fromEnv();

const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_GROUP_CHAT_ID = process.env.TG_GROUP_CHAT_ID;
const TG_BOT_USERNAME = process.env.TG_BOT_USERNAME || 'alchemysupportbot';
const GSHEETS_WEBHOOK_URL = process.env.GSHEETS_WEBHOOK_URL;
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

const ARCHETYPES = {
  1: 'Руководите командой',
  2: 'Развиваете свой бизнес',
  3: 'Реализованы – одиноки',
  4: 'Наставник для других',
  5: 'Совмещаете семью и работу',
  6: 'Выходите на новый виток'
};

const ROLE_PROF = {
  top: 'Руководитель в компании',
  manager: 'Специалист в компании',
  owner: 'Развивает свой бизнес',
  expert: 'Эксперт – частная практика',
  transition: 'В переходе между ролями',
  family: 'Фокус на семье – не работает'
};

const INCOME_LABELS = {
  under_100: 'до 100k ₽',
  '100_300': '100–300k ₽',
  '300_1m': '300k–1M ₽',
  '1_3m': '1–3M ₽',
  '3m_plus': '3M+ ₽'
};

const RELATIONS_LABELS = {
  married_good: 'В паре – хорошо',
  married_issues: 'В паре – есть напряжение',
  single_choice: 'Одна – свой выбор',
  single_seeking: 'Хочет встретить близкого – пока не получается',
  recent_split: 'Развод или расставание недавно'
};

const FAMILY_LABELS = {
  kids_small: 'Дети до 7 лет',
  kids_school: 'Дети школьники / подростки',
  kids_adult: 'Дети взрослые',
  no_kids: 'Детей нет',
  considering: 'Беременна или планирует'
};

// Q2 «Что сейчас сложнее всего в работе?» (multi, до 2)
const WORK_PAIN_LABELS = {
  low_income: 'Низкий доход',
  overwork: 'Работа на износ',
  role_ceiling: 'Потолок в роли',
  operational_lock: 'Всё держится на мне',
  meaning_lost: 'Потерян смысл и драйв'
};

// Q6 «Что сейчас сложнее всего в отношениях?» (multi, до 2)
const RELATIONSHIP_PAIN_LABELS = {
  lack_intimacy: 'Нет доверия и близости',
  low_passion: 'Мало страсти',
  cannot_be_self: 'Не может быть собой',
  no_peer_men: 'Не встречает равных',
  cannot_let_in: 'Не может впустить'
};

// Архетип присваивается по сигналам Q1 (профессия) + Q2 (сложности в работе)
// + Q4 (личная жизнь) + Q6 (сложности в отношениях) + Q5 (дети).
// Логика — приоритетная: сначала сильные override-сигналы (одиночество на
// уровне = архетип 3), потом профессионально-driven, потом edge cases.
function pickArchetype(a) {
  const workPains = a.work_pain || [];
  const relPains = a.relationship_pain || [];
  const primaryWork = workPains[0];
  const primaryRel = relPains[0];
  const prof = a.prof;
  const rel = a.relations;
  const fam = a.family;

  // 1. Strongest override: одиночество «не встречаю равных» + одна → 3
  const lonelinessSignals = ['no_peer_men', 'cannot_let_in'];
  const singleStates = ['single_choice', 'single_seeking', 'recent_split'];
  if (relPains.some((p) => lonelinessSignals.includes(p)) && singleStates.includes(rel)) {
    return 3;
  }

  // 2. «Всё держится на мне» у собственника/эксперта → 2 (Собственник)
  if (primaryWork === 'operational_lock' && (prof === 'owner' || prof === 'expert')) {
    return prof === 'expert' ? 4 : 2;
  }

  // 3. Утрата смысла или потолок в роли у наёмника → 6 (Новый виток)
  if (primaryWork === 'meaning_lost') return 6;
  if (primaryWork === 'role_ceiling' && (prof === 'manager' || prof === 'top')) return 6;

  // 4. Профессионально-driven основа
  if (prof === 'expert') return 4;
  if (prof === 'owner') return 2;
  if (prof === 'manager' || prof === 'top') return 1;

  // 5. Семья / маленькие дети → 5 (Сплетающая)
  if (prof === 'family' || fam === 'kids_small' || fam === 'kids_school') return 5;

  // 6. single_seeking без сильного сигнала → 3 (Реализованы_но_одиноки)
  if (rel === 'single_seeking') return 3;

  // 7. Переход + нет сильного pull → 6
  if (prof === 'transition') return 6;

  // 8. Fallbacks по primary work pain
  if (primaryWork === 'overwork') return 1;
  if (primaryWork === 'low_income') return 2;

  return 1;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function formatNotification(answers, archetypeId) {
  const c = answers.contact || {};
  const arch = ARCHETYPES[archetypeId] || 'Неопределён';
  const workPainStr = (answers.work_pain || []).map((p) => WORK_PAIN_LABELS[p] || p).join(', ');
  const relPainStr = (answers.relationship_pain || []).map((p) => RELATIONSHIP_PAIN_LABELS[p] || p).join(', ');

  const tg = (c.telegram || '').trim();
  const tgLink = tg.startsWith('@')
    ? `<a href="https://t.me/${escapeHtml(tg.slice(1))}">${escapeHtml(tg)}</a>`
    : escapeHtml(tg);

  return `🆕 <b>Новая анкета — ${escapeHtml(c.name || '?')}</b>

📧 ${escapeHtml(c.email || '—')}
💬 ${tgLink || '—'}

<b>Архетип:</b> ${escapeHtml(arch)}

<b>Профессия:</b> ${escapeHtml(ROLE_PROF[answers.prof] || '—')}
<b>Доход:</b> ${escapeHtml(INCOME_LABELS[answers.income] || '—')}
<b>Личная жизнь:</b> ${escapeHtml(RELATIONS_LABELS[answers.relations] || '—')}
<b>Дети:</b> ${escapeHtml(FAMILY_LABELS[answers.family] || '—')}
<b>Сложности в работе:</b> ${escapeHtml(workPainStr || '—')}
<b>Сложности в отношениях:</b> ${escapeHtml(relPainStr || '—')}

<b>Мечта:</b>
${escapeHtml(answers.dream || '—')}

<b>Препятствия:</b>
${escapeHtml(answers.obstacles || '—')}

<b>Что пробовала:</b>
${escapeHtml(answers.tried || '—')}`;
}

function shortToken() {
  return crypto.randomBytes(9).toString('base64url');
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
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TG sendMessage failed: ${res.status} ${body}`);
  }
  return res.json();
}

async function appendToSheet(answers, archetypeId, token) {
  if (!GSHEETS_WEBHOOK_URL) return;

  const c = answers.contact || {};
  const workPainStr = (answers.work_pain || []).map((p) => WORK_PAIN_LABELS[p] || p).join(', ');
  const relPainStr = (answers.relationship_pain || []).map((p) => RELATIONSHIP_PAIN_LABELS[p] || p).join(', ');

  const payload = {
    secret: process.env.GSHEETS_SECRET || '',
    timestamp: new Date().toISOString(),
    token,
    name: c.name || '',
    email: c.email || '',
    telegram: c.telegram || '',
    archetype: ARCHETYPES[archetypeId] || '',
    profession: ROLE_PROF[answers.prof] || '',
    income: INCOME_LABELS[answers.income] || '',
    relations: RELATIONS_LABELS[answers.relations] || '',
    children: FAMILY_LABELS[answers.family] || '',
    work_pain: workPainStr,
    relationship_pain: relPainStr,
    dream: answers.dream || '',
    obstacles: answers.obstacles || '',
    tried: answers.tried || ''
  };

  try {
    await fetch(GSHEETS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.error('Sheets append failed:', e.message);
  }
}

// Notion CRM — creates a new page in the configured database for each anketa.
// Database properties expected (see docs/notion-setup.md for exact setup):
//   Имя (title) · Статус (select, default «Новая») · Email · Telegram (url)
//   Архетип / Профессия / Доход / Личная жизнь / Дети (select)
//   Сложности в работе (multi_select) · Сложности в отношениях (multi_select)
//   Мечта / Препятствия / Что пробовала (rich_text) · Токен (rich_text)
//
// IMPORTANT: schema changed 2026-05-22 — добавлены multi-select-свойства
// «Сложности в работе» и «Сложности в отношениях», убрано «Этап», свойство
// «Отношения» переименовано в «Личная жизнь». Старое свойство «Боли»
// больше не используется. Обнови шапку базы вручную.
async function appendToNotion(answers, archetypeId, token) {
  if (!NOTION_TOKEN || !NOTION_DATABASE_ID) return;

  const c = answers.contact || {};
  const workPainNames = (answers.work_pain || []).map((p) => WORK_PAIN_LABELS[p] || p);
  const relPainNames = (answers.relationship_pain || []).map((p) => RELATIONSHIP_PAIN_LABELS[p] || p);

  const tg = (c.telegram || '').trim();
  const tgUrl = tg
    ? (tg.startsWith('http') ? tg : `https://t.me/${tg.replace(/^@/, '')}`)
    : null;

  // Notion's rich_text content cap is 2000 chars per item. Truncate defensively.
  const richText = (s) => [{ text: { content: String(s || '').slice(0, 2000) } }];

  const properties = {
    'Имя': { title: [{ text: { content: c.name || '—' } }] },
    'Статус': { select: { name: 'Новая' } },
    'Архетип': { select: { name: ARCHETYPES[archetypeId] || 'Неопределён' } },
    'Токен': { rich_text: richText(token) }
  };

  if (c.email) properties['Email'] = { email: c.email };
  if (tgUrl) properties['Telegram'] = { url: tgUrl };
  if (answers.prof) properties['Профессия'] = { select: { name: ROLE_PROF[answers.prof] || answers.prof } };
  if (answers.income) properties['Доход'] = { select: { name: INCOME_LABELS[answers.income] || answers.income } };
  if (answers.relations) properties['Личная жизнь'] = { select: { name: RELATIONS_LABELS[answers.relations] || answers.relations } };
  if (answers.family) properties['Дети'] = { select: { name: FAMILY_LABELS[answers.family] || answers.family } };
  if (workPainNames.length) properties['Сложности в работе'] = { multi_select: workPainNames.map((name) => ({ name })) };
  if (relPainNames.length) properties['Сложности в отношениях'] = { multi_select: relPainNames.map((name) => ({ name })) };
  if (answers.dream) properties['Мечта'] = { rich_text: richText(answers.dream) };
  if (answers.obstacles) properties['Препятствия'] = { rich_text: richText(answers.obstacles) };
  if (answers.tried) properties['Что пробовала'] = { rich_text: richText(answers.tried) };

  try {
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        parent: { database_id: NOTION_DATABASE_ID },
        properties
      })
    });
    if (!response.ok) {
      const errBody = await response.text();
      console.error('Notion append failed:', response.status, errBody.slice(0, 500));
      return;
    }
    // Save the Notion page id keyed by submission token so /api/letter can
    // append the generated letter back into the same card. TTL matches the
    // anketa TTL (24h) — letter generation happens immediately after submit.
    const data = await response.json();
    if (data && data.id) {
      try {
        await redis.set(`notion-page:${token}`, data.id, { ex: 60 * 60 * 24 });
      } catch (e) {
        console.error('redis set notion-page failed:', e.message);
      }
    }
  } catch (e) {
    console.error('Notion append exception:', e.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const answers = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ error: 'Invalid body' });
  }

  const archetypeId = pickArchetype(answers);
  const token = shortToken();

  try {
    await redis.set(
      `anketa:${token}`,
      JSON.stringify({ answers, archetypeId, ts: Date.now() }),
      { ex: 60 * 60 * 24 }
    );

    const tgText = formatNotification(answers, archetypeId);
    const tgResult = await Promise.allSettled([sendTgMessage(TG_GROUP_CHAT_ID, tgText)]);
    if (tgResult[0].status === 'rejected') {
      console.error('TG notification failed:', tgResult[0].reason?.message || tgResult[0].reason);
    }

    await Promise.allSettled([
      appendToSheet(answers, archetypeId, token),
      appendToNotion(answers, archetypeId, token)
    ]);

    return res.status(200).json({
      ok: true,
      token,
      botUsername: TG_BOT_USERNAME
    });
  } catch (err) {
    console.error('submit error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
