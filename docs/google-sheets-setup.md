# Google Sheets CRM — настройка

Сюда каждая заполненная анкета с `/test.html` падает строкой. Таблица заточена под ручное ведение клиентов по статусам.

## Архитектура

```
quiz submit → /api/submit (Vercel) → POST → Apps Script Web App → row in Sheet
```

Конфигурация:
- На стороне Vercel: env vars `GSHEETS_WEBHOOK_URL` и (опционально) `GSHEETS_SECRET`
- На стороне Google: Google Sheet + привязанный Apps Script с deployment как Web App

---

## Шаг 1. Создать Google Sheet

1. Откройте https://sheets.new — новая таблица.
2. Переименуйте файл, например: «Алхимия — анкеты».
3. Переименуйте вкладку (первый лист) с «Лист1» / «Sheet1» → **`Анкеты`** (важно: имя должно совпадать с тем, что в скрипте).

### Структура колонок (вставьте как заголовки в row 1)

| Кол | Заголовок | Источник | Заполнение |
|---|---|---|---|
| A | Получена | timestamp | автоматически |
| B | Статус | — | **dropdown**, см. ниже |
| C | Имя | контакт | автоматически |
| D | Email | контакт | автоматически |
| E | Telegram | контакт | автоматически |
| F | Архетип | расчётный | автоматически |
| G | Профессия | Q1 | автоматически |
| H | Этап | Q2 | автоматически |
| I | Доход | Q3 | автоматически |
| J | Отношения | Q4 | автоматически |
| K | Дети | Q5 | автоматически |
| L | Боли | Q6 (многозначное) | автоматически |
| M | Мечта | Q7 (open text) | автоматически |
| N | Препятствия | Q8 (open text) | автоматически |
| O | Что пробовала | Q9 (open text) | автоматически |
| P | Токен | служебный | автоматически |
| Q | Кто ведёт | — | **вручную** куратор |
| R | Комментарии | — | **вручную** заметки |

Заголовки можно вставить одной строкой (Tab-separated):
```
Получена	Статус	Имя	Email	Telegram	Архетип	Профессия	Этап	Доход	Отношения	Дети	Боли	Мечта	Препятствия	Что пробовала	Токен	Кто ведёт	Комментарии
```

### Закрепить шапку

`View → Freeze → 1 row` — заголовок прилипнет при прокрутке.

---

## Шаг 2. Dropdown для статуса (колонка B)

1. Выделите колонку B целиком (кликните на букву «B»).
2. `Data → Data validation → Add rule`.
3. **Criteria:** Dropdown.
4. Вставьте варианты (по одному):
   - **Новая**
   - **Связались**
   - **Назначено собеседование**
   - **Собеседование прошло**
   - **Приглашена**
   - **В программе**
   - **Отказала**
   - **Не подходит**
   - **На паузе**
5. **Show a warning** (мягкая валидация).
6. **Done**.

### Цвета статусов (опционально, но удобно)

В том же `Data validation` каждому варианту можно назначить цвет. Предложение:

| Статус | Цвет |
|---|---|
| Новая | бледно-жёлтый (#fff3c4) |
| Связались | бледно-синий (#cfe2f3) |
| Назначено собеседование | синий чуть ярче (#9fc5e8) |
| Собеседование прошло | бледно-голубой (#c9daf8) |
| Приглашена | бледно-зелёный (#d9ead3) |
| В программе | зелёный (#93c47d) |
| Отказала | бледно-серый (#efefef) |
| Не подходит | серый (#cccccc) |
| На паузе | бледно-оранжевый (#fce5cd) |

---

## Шаг 3. Apps Script — приёмник POST

1. В таблице: `Extensions → Apps Script` — откроется редактор скриптов.
2. Удалите дефолтный `function myFunction() {}` и вставьте код ниже целиком.
3. Подмените `EXPECTED_SECRET` на свой secret (любая случайная строка, например `openssl rand -hex 16` → 32 символа). **Запомните этот secret — он понадобится на стороне Vercel.**
4. Сохраните проект (значок дискеты или Cmd+S). Дайте имя, например «Алхимия Sheets Webhook».

```javascript
// Apps Script для Google Sheets — принимает POST с анкетой и пишет строку.

const SHEET_NAME = 'Анкеты';
const EXPECTED_SECRET = 'PASTE_YOUR_SECRET_HERE'; // тот же, что в Vercel env GSHEETS_SECRET

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // shared-secret check (если используется)
    if (EXPECTED_SECRET && data.secret !== EXPECTED_SECRET) {
      return json({ ok: false, error: 'unauthorized' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return json({ ok: false, error: 'sheet not found: ' + SHEET_NAME });

    sheet.appendRow([
      data.timestamp ? new Date(data.timestamp) : new Date(), // A: Получена
      'Новая',                                                 // B: Статус (default)
      data.name || '',                                         // C: Имя
      data.email || '',                                        // D: Email
      data.telegram || '',                                     // E: Telegram
      data.archetype || '',                                    // F: Архетип
      data.profession || '',                                   // G: Профессия
      data.stage || '',                                        // H: Этап
      data.income || '',                                       // I: Доход
      data.relations || '',                                    // J: Отношения
      data.children || '',                                     // K: Дети
      data.pains || '',                                        // L: Боли
      data.dream || '',                                        // M: Мечта
      data.obstacles || '',                                    // N: Препятствия
      data.tried || '',                                        // O: Что пробовала
      data.token || '',                                        // P: Токен
      '',                                                       // Q: Кто ведёт (manual)
      ''                                                        // R: Комментарии (manual)
    ]);

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

---

## Шаг 4. Deploy Apps Script как Web App

1. В редакторе скриптов: **Deploy → New deployment**.
2. Шестерёнка слева от «Select type» → **Web app**.
3. Поля:
   - **Description:** Алхимия Sheets Webhook v1
   - **Execute as:** Me (ваш аккаунт)
   - **Who has access:** Anyone (без аутентификации — Vercel должен POST'ать без OAuth)
4. **Deploy**.
5. Откроется диалог авторизации — разрешите доступ скрипту к Sheets.
6. Скопируйте **Web app URL** — он выглядит так:
   `https://script.google.com/macros/s/AKfycbz.../exec`
7. Этот URL нужен на следующем шаге.

> ⚠️ Если позже измените код скрипта — нужно `Deploy → Manage deployments → ✏️ edit → New version → Deploy` чтобы изменения подхватились на том же URL.

---

## Шаг 5. Env vars на Vercel

В проекте `alchemy` на Vercel: `Settings → Environment Variables`.

Добавить два:

| Name | Value | Scope |
|---|---|---|
| `GSHEETS_WEBHOOK_URL` | Web app URL из шага 4 | Production + Preview |
| `GSHEETS_SECRET` | Та же случайная строка что в `EXPECTED_SECRET` Apps Script | Production + Preview |

`GSHEETS_SECRET` помечайте как **Sensitive**.

После сохранения — **Redeploy** последний коммит (Vercel не редеплоит автоматом при изменении env).

---

## Шаг 6. Тест

1. Откройте https://wmnalchemy.com/test.html
2. Заполните квиз тестово (имя «ТЕСТ-N», валидный email, любой ник в TG).
3. Сразу после сабмита — откройте Sheet. Должна появиться новая строка со статусом «Новая».
4. Проверьте что все колонки заполнены: имя, email, telegram, архетип, профессия, этап, доход, отношения, дети, боли, открытые ответы (мечта/препятствия/пробовала), токен.

Если строка не появилась:
- Vercel → проект → Functions → `submit` → последние логи. Ищите `Sheets append failed`.
- Apps Script → Executions (слева, иконка часов) → последние запуски. Можно увидеть `unauthorized` (значит secret не совпадает) или другие ошибки.

---

## Дальнейшее ведение клиентов

### Filter view «Только новые» (work queue)

`Data → Create filter view → name «Новые»` → в колонке B (Статус) выберите только «Новая».
Куратор видит только необработанные анкеты.

### Filter view по куратору

`Data → Create filter view → name «Я веду»` → в колонке Q (Кто ведёт) фильтр по своему имени.

### Сводная по статусам (опционально)

`Insert → Pivot table → Range: A:R → New sheet`:
- Rows: Статус (B)
- Values: count of any column

Получаете дашборд: сколько анкет в каждом статусе.

### Сводная по архетипам

То же, но Rows = Архетип (F). Видно распределение аудитории.

---

## Безопасность

- **Apps Script URL открыт миру** (это требование Vercel POST'а без OAuth). Это значит любой, кто узнает URL, может POST'ить в Sheet.
- **Защита**: `GSHEETS_SECRET` — общий секрет в payload. Apps Script отклоняет запросы без правильного secret. Не публикуйте этот URL и secret вместе.
- **Если secret скомпрометирован**: смените значение в обоих местах (Vercel env + Apps Script `EXPECTED_SECRET`), редеплойте Apps Script (New version) и Vercel.

---

## Что меняется в этой настройке

- `api/submit.js`: функция `appendToSheet` отправляет структурированный JSON с лейблами на русском (вместо raw enum-ключей). Принимает `token` для трассировки.
- `appendToSheet` теперь не блокирует ответ пользователю — она просто запускается и логирует ошибки.
- Никаких других изменений в коде.

---

## Расширения на потом (не для MVP)

- **Дашборд**: отдельный лист с агрегатами (новые за неделю, конверсия в собеседование, в программу).
- **Slack/Email-нотификации** на новые анкеты — Apps Script может слать через `MailApp.sendEmail` или Slack webhook.
- **Автозаполнение даты последнего касания** — Apps Script trigger `onEdit` обновляет «Last touched» колонку при любом ручном редактировании строки.
- **Связь с TG-ботом**: уведомлять Ольгу о новых анкетах прямо в Sheet-канал, не только в общий TG-чат.
