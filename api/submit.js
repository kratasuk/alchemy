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
  3: 'Реализованы, но одиноки',
  4: 'Наставник для других',
  5: 'Совмещаете семью и работу',
  6: 'Выходите на новый виток'
};

const ROLE_PROF = {
  manager: 'Специалист в найме',
  top: 'Руководитель / топ-менеджер',
  owner: 'Собственник, развивает бизнес',
  expert: 'Эксперт, частная практика',
  transition: 'В переходе между ролями',
  family: 'В семейной фазе'
};

const ETAP_LABELS = {
  stable_growth: 'Стабильный рост',
  new_level: 'Новый уровень — учится держать',
  choice_point: 'Точка выбора',
  ceiling: 'Уперлась в потолок',
  not_main: 'Сейчас не главное'
};

const INCOME_LABELS = {
  under_100: 'до 100k ₽',
  '100_300': '100–300k ₽',
  '300_1m': '300k–1M ₽',
  '1_3m': '1–3M ₽',
  '3m_plus': '3M+ ₽'
};

const RELATIONS_LABELS = {
  married_good: 'В паре — хорошо',
  married_issues: 'В паре — что-то не так',
  single_choice: 'Одна по выбору',
  single_seeking: 'Одна, ищет',
  recent_split: 'Недавно расставание'
};

const FAMILY_LABELS = {
  kids_small: 'Дети до 7 лет',
  kids_school: 'Дети школьники / подростки',
  kids_adult: 'Дети взрослые',
  no_kids: 'Без детей',
  considering: 'Думает / готовится'
};

const PAIN_LABELS = {
  istoshenie: 'Истощение',
  zhenstvennost: 'Потеря женственности',
  odinochestvo: 'Одиночество на уровне',
  zhonglirovanie: 'Перегруз ролями',
  proyavitsya: 'Внутренний потолок',
  kontrol: 'Гиперконтроль'
};

function pickArchetype(a) {
  const pains = a.pains || [];
  const primary = pains[0];
  const prof = a.prof;
  const rel = a.relations;
  const fam = a.family;
  if (primary === 'odinochestvo') return 3;
  if (primary === 'proyavitsya') return 6;
  if (primary === 'zhonglirovanie') return 5;
  if (prof === 'expert') return 4;
  if (prof === 'owner') return 2;
  if (prof === 'manager' || prof === 'top') return 1;
  if (prof === 'family' || fam === 'kids_small' || fam === 'kids_school') return 5;
  if (rel === 'single_seeking') return 3;
  if (prof === 'transition') return 6;
  if (primary === 'istoshenie') return 1;
  if (primary === 'zhenstvennost') return 2;
  return 1;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function formatNotification(answers, archetypeId) {
  const c = answers.contact || {};
  const arch = ARCHETYPES[archetypeId] || 'Неопределён';
  const pains = (answers.pains || []).map((p) => PAIN_LABELS[p] || p).join(', ');

  const tg = (c.telegram || '').trim();
  const tgLink = tg.startsWith('@')
    ? `<a href="https://t.me/${escapeHtml(tg.slice(1))}">${escapeHtml(tg)}</a>`
    : escapeHtml(tg);

  return `🆕 <b>Новая анкета — ${escapeHtml(c.name || '?')}</b>

📧 ${escapeHtml(c.email || '—')}
💬 ${tgLink || '—'}

<b>Архетип:</b> ${escapeHtml(arch)}

<b>Профессия:</b> ${escapeHtml(ROLE_PROF[answers.prof] || '—')}
<b>Этап:</b> ${escapeHtml(ETAP_LABELS[answers.etap] || '—')}
<b>Доход:</b> ${escapeHtml(INCOME_LABELS[answers.income] || '—')}
<b>Отношения:</b> ${escapeHtml(RELATIONS_LABELS[answers.relations] || '—')}
<b>Дети:</b> ${escapeHtml(FAMILY_LABELS[answers.family] || '—')}
<b>Боли:</b> ${escapeHtml(pains || '—')}

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
  const pains = (answers.pains || []).map((p) => PAIN_LABELS[p] || p).join(', ');

  const payload = {
    secret: process.env.GSHEETS_SECRET || '',
    timestamp: new Date().toISOString(),
    token,
    name: c.name || '',
    email: c.email || '',
    telegram: c.telegram || '',
    archetype: ARCHETYPES[archetypeId] || '',
    profession: ROLE_PROF[answers.prof] || '',
    stage: ETAP_LABELS[answers.etap] || '',
    income: INCOME_LABELS[answers.income] || '',
    relations: RELATIONS_LABELS[answers.relations] || '',
    children: FAMILY_LABELS[answers.family] || '',
    pains,
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
//   Архетип / Профессия / Этап / Доход / Отношения / Дети (select)
//   Боли (multi_select) · Мечта / Препятствия / Что пробовала (rich_text)
//   Токен (rich_text)
async function appendToNotion(answers, archetypeId, token) {
  if (!NOTION_TOKEN || !NOTION_DATABASE_ID) return;

  const c = answers.contact || {};
  const painsLabels = (answers.pains || []).map((p) => PAIN_LABELS[p] || p);

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
  if (answers.etap) properties['Этап'] = { select: { name: ETAP_LABELS[answers.etap] || answers.etap } };
  if (answers.income) properties['Доход'] = { select: { name: INCOME_LABELS[answers.income] || answers.income } };
  if (answers.relations) properties['Отношения'] = { select: { name: RELATIONS_LABELS[answers.relations] || answers.relations } };
  if (answers.family) properties['Дети'] = { select: { name: FAMILY_LABELS[answers.family] || answers.family } };
  if (painsLabels.length) properties['Боли'] = { multi_select: painsLabels.map((name) => ({ name })) };
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
