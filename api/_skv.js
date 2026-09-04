// Клиент SKV для серверных функций.
//
// SKV – источник правды по аудитории: регистрации на события и карточки людей
// с сегментами, по которым потом идёт рассылка в боте. Пишем в дерево `alchemy`
// (отдельное от личного дерева Лизы `eliza` – правило «один проект, одно дерево»).
//
// Структура дерева:
//   people                      – контейнер
//   people.tg<chat_id>          – карточка человека: имя, телеграм, сегменты, подписка
//   webinar                     – контейнер
//   webinar.<event>             – событие, например webinar.2026-10-03
//   webinar.<event>.<token>     – одна регистрация
//
// Ключ узла = VAL_NAME, хеши резолвим заново каждый прогон (правило SKV:
// не кэшировать хеши между сессиями).

const BASE = (process.env.SKV_BASE_URL || 'https://skv.indexinfor.com/api/v1').replace(/\/$/, '');
const KEY = process.env.SKV_API_KEY || process.env.SKV_KEY || process.env.SKV_TOKEN || '';
export const SKV_TREE = process.env.SKV_TREE || 'alchemy';
const STR = 12; // UTF8String

export function skvConfigured() {
  return Boolean(KEY);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// 503 у SKV – транзиентный backpressure, а не отказ: повторяем с паузой.
async function call(method, path, body, { retries = 3 } = {}) {
  if (!KEY) throw new Error('SKV_API_KEY не задан');
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await sleep(300 * attempt);
    let res;
    try {
      res = await fetch(`${BASE}${path}`, {
        method,
        headers: { 'X-API-Key': KEY, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      lastErr = e;
      continue;
    }
    if (res.status === 404) return { status: 404, data: null };
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (res.ok || res.status === 422) return { status: res.status, data };
    lastErr = new Error(`SKV ${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
    if (res.status < 500 && res.status !== 429) throw lastErr;
  }
  throw lastErr;
}

function vals(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([val_name, value]) => ({ val_name, type_id: STR, value: String(value) }));
}

async function rootHash(tree) {
  const { data } = await call('GET', `/xtrees/${tree}/root`);
  return data?.node_hash;
}

async function byKey(tree, key) {
  const { data } = await call('GET', `/xtrees/${tree}/nodes/by-key?key=${encodeURIComponent(key)}`);
  return data?.node_hash ? data : null;
}

// Повторный add того же ключа отвечает 422 – это значит «уже есть», не ошибка.
async function addNode(tree, parentHash, key, fields) {
  const body = {
    correlation_id: crypto.randomUUID(),
    parent_hash: parentHash,
    vals: [{ val_name: 'VAL_NAME', type_id: STR, value: key }, ...vals(fields)]
  };
  const { status, data } = await call('POST', `/xtrees/${tree}/nodes`, body);
  if (status === 422) {
    const existing = await byKey(tree, key);
    return existing?.node_hash || null;
  }
  return data?.applied_operations?.[0]?.result_node_hash || data?.result_node_hash || null;
}

async function updateNode(tree, hash, fields) {
  await call('PATCH', `/xtrees/${tree}/nodes/${hash}`, {
    correlation_id: crypto.randomUUID(),
    vals: vals(fields)
  });
}

// Контейнер под ключом: берём существующий или создаём.
async function ensure(tree, parentHash, key, fields = {}) {
  const existing = await byKey(tree, key);
  if (existing?.node_hash) return existing.node_hash;
  return addNode(tree, parentHash, key, fields);
}

/** Записать регистрацию на событие. Возвращает ключ узла. */
export async function saveRegistration({ tree = SKV_TREE, event, token, fields }) {
  const root = await rootHash(tree);
  const webinar = await ensure(tree, root, 'webinar');
  const eventKey = `webinar.${event}`;
  const eventHash = await ensure(tree, webinar, eventKey, { name: event });
  const key = `${eventKey}.${token}`;
  await addNode(tree, eventHash, key, fields);
  return key;
}

/** Все регистрации на событие: список объектов вида {ключ: значение}. Убранные пропускаем. */
export async function listRegistrations({ tree = SKV_TREE, event } = {}) {
  const eventNode = await byKey(tree, `webinar.${event}`);
  if (!eventNode?.node_hash) return [];

  const out = [];
  let offset = 0;
  const limit = 200;
  // ответ страничный, идём до конца
  for (let guard = 0; guard < 50; guard++) {
    const { data } = await call('GET', `/xtrees/${tree}/nodes/${eventNode.node_hash}/children?limit=${limit}&offset=${offset}`);
    const kids = data?.children || [];
    for (const kid of kids) {
      const row = {};
      for (const v of kid.vals || []) row[v.val_name] = v.value;
      if (row.removed === '1') continue;
      if (!row.token) continue;
      out.push(row);
    }
    offset += kids.length;
    if (!kids.length || offset >= (data?.total_count ?? offset)) break;
  }
  return out;
}

/**
 * Привязать телеграм к регистрации: создаём или обновляем карточку человека
 * (это и есть база для рассылки) и помечаем саму регистрацию подтверждённой.
 */
export async function linkTelegram({ tree = SKV_TREE, event, token, tg, fields }) {
  const root = await rootHash(tree);
  const peopleHash = await ensure(tree, root, 'people');
  const personKey = `people.tg${tg.id}`;
  const now = new Date().toISOString();

  // На карточке человека держим только то, по чему сегментируем и обращаемся.
  // Служебное (токен, статус, время подачи) остаётся на самой регистрации.
  const SEGMENTS = ['name', 'age', 'gap', 'energy', 'prof', 'work_pain', 'income', 'relations', 'family', 'want', 'labels'];
  const person = await byKey(tree, personKey);
  const payload = { tg_id: tg.id, tg_username: tg.username, tg_name: tg.first_name, subscribed: '1', updated: now, last_event: event };
  SEGMENTS.forEach((k) => { if (fields[k]) payload[k] = fields[k]; });
  if (person?.node_hash) {
    await updateNode(tree, person.node_hash, payload);
  } else {
    await addNode(tree, peopleHash, personKey, { ...payload, created: now });
  }

  const reg = await byKey(tree, `webinar.${event}.${token}`);
  if (reg?.node_hash) {
    await updateNode(tree, reg.node_hash, { tg_id: tg.id, tg_username: tg.username, status: 'confirmed', confirmed: now });
  }
  return personKey;
}
