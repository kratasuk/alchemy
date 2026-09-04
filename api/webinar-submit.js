// Приём анкеты регистрации на вебинар.
//
// Что делает:
//   1. складывает ответы в быструю память (Redis) под токеном – по нему бот
//      узнает человека, когда он нажмёт «Открыть Telegram»;
//   2. пишет регистрацию в SKV (дерево alchemy, ветка webinar.<событие>).
//
// Команде на каждую регистрацию ничего не шлём: раз в сутки уходит одна сводка,
// её собирает webinar-digest.js. Если SKV недоступен, регистрация всё равно
// проходит: ответы лежат в Redis и в очереди skv-outbox, дозальём потом.

import { Redis } from '@upstash/redis';
import crypto from 'crypto';
import { saveRegistration, skvConfigured, SKV_TREE } from './_skv.js';
import { EVENT } from './_event.js';

const redis = Redis.fromEnv();

const TG_BOT_USERNAME = process.env.TG_BOT_USERNAME || 'alchemysupportbot';


const LABELS = {
  age: {
    under_35: 'До 35', '35_40': '35–40', '40_45': '40–45', '45_50': '45–50', '50_plus': '50 и больше'
  },
  gap: {
    body: 'Тело и энергия', money: 'Деньги и реализация', relations: 'Отношения'
  },
  energy: {
    burnout: 'Сильное истощение', low: 'Ниже среднего', mid: 'Средне', good: 'Выше среднего', high: 'Высокий'
  },
  prof: {
    top: 'Руководитель в компании', manager: 'Специалист в компании', owner: 'Развиваю свой бизнес',
    expert: 'Эксперт, веду частную практику', transition: 'В переходе', family: 'Фокус на семье'
  },
  work_pain: {
    low_income: 'Зарабатываю меньше, чем могла бы', overwork: 'Работаю на износ',
    role_ceiling: 'Упёрлась в потолок роли', operational_lock: 'Всё держится на мне',
    meaning_lost: 'Не вижу смысла', not_relevant: 'Работа не актуальна'
  },
  income: {
    under_100: 'Меньше 100 тысяч', '100_300': '100–300 тысяч', '300_1m': '300 тысяч – 1 миллион',
    '1_3m': '1–3 миллиона', '3m_plus': 'Больше 3 миллионов'
  },
  relations: {
    married_good: 'В браке, всё хорошо', married_issues: 'В браке, есть напряжение',
    single_choice: 'Одна, это мой выбор', single_seeking: 'Хочу встретить близкого человека',
    recent_split: 'Развод или расставание недавно'
  },
  family: {
    kids_small: 'Дети до 7 лет', kids_school: 'Школьники или подростки',
    kids_adult: 'Взрослые дети', no_kids: 'Детей нет', considering: 'Беременна или планирую'
  }
};

const label = (field, value) => LABELS[field]?.[value] || value || '';

// Поля регистрации в SKV: и коды (для выборок), и подписи (чтобы читалось глазами).
function skvFields(a, token) {
  return {
    name: a.name,
    event: EVENT,
    token,
    ts: new Date().toISOString(),
    status: 'new',
    source: a.source || 'webinar-page',
    age: a.age,
    gap: a.gap,
    energy: a.energy,
    prof: a.prof,
    work_pain: (a.work_pain || []).join(' '),
    income: a.income,
    relations: a.relations,
    family: a.family,
    want: a.want,
    labels: [label('age', a.age), label('gap', a.gap), label('energy', a.energy), label('prof', a.prof), label('income', a.income), label('relations', a.relations), label('family', a.family)].filter(Boolean).join(' · ')
  };
}

const REQUIRED = ['age', 'gap', 'energy', 'prof', 'income', 'relations', 'family'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const a = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!a || typeof a !== 'object') return res.status(400).json({ error: 'Invalid body' });
  if (!String(a.name || '').trim()) return res.status(400).json({ error: 'Не заполнено имя' });
  const missing = REQUIRED.filter((f) => !a[f]);
  if (missing.length) return res.status(400).json({ error: `Не заполнено: ${missing.join(', ')}` });

  const token = shortToken();
  const fields = skvFields(a, token);

  try {
    await redis.set(
      `webinar:${token}`,
      JSON.stringify({ event: EVENT, answers: a, fields, ts: Date.now() }),
      { ex: 60 * 60 * 24 * 30 }
    );

    const results = await Promise.allSettled([
      skvConfigured()
        ? saveRegistration({ event: EVENT, token, fields })
        : Promise.reject(new Error('SKV_API_KEY не задан'))
    ]);

    if (results[0].status === 'rejected') console.error('SKV write failed:', results[0].reason?.message || results[0].reason);

    // Не дошло до SKV – кладём в очередь, дозальём отдельно. Регистрация не теряется.
    if (results[0].status === 'rejected') {
      await redis.lpush('skv-outbox', JSON.stringify({ tree: SKV_TREE, event: EVENT, token, fields })).catch(() => {});
    }

    return res.status(200).json({ ok: true, token, botUsername: TG_BOT_USERNAME });
  } catch (err) {
    console.error('webinar-submit error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
