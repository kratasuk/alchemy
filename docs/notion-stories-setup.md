# Notion-CMS для статей выпускниц — настройка

Сотрудник пишет статью в Notion, ты (или скрипт) запускаешь
`node scripts/build-from-notion.cjs <slug>` — статья собирается и
коммитится в репо, Vercel деплоит. Через минуту на проде.

## Шаг 1 — Создать базу в Notion

Создай в Notion новую базу с названием **«Истории выпускниц»**. Свойства:

| Имя поля (точно) | Тип | Заполняет | Пример |
|---|---|---|---|
| `Slug` | Title | Сотрудник | `litvinenko`, `petrova-ekaterina` |
| `Heroine name` | Text | Сотрудник | `Евгения Л.` |
| `Heroine role` | Text | Сотрудник | `Предприниматель` |
| `Article title` | Text | Сотрудник | «После 25 лет вместе мы вышли на новый уровень…» |
| `OG title` | Text | Сотрудник | «После 25 лет вместе…» (для Telegram-превью) |
| `OG description` | Text | Сотрудник | «История Евгении – о том, как она перестала…» |
| `Voice card quote` | Text | Сотрудник | Короткая цитата для карточки на главной |
| `Hero photo` | Files | Сотрудник | 1 фото (портрет героини) |
| `Status` | Select | Сотрудник | `Draft` / `Ready to publish` / `Published` |
| `Published at` | Date | Скрипт | Авто-заполняется при публикации |
| `Story URL` | URL | Скрипт | Авто-заполняется (https://wmnalchemy.com/stories/...) |

**Slug** должен быть на латинице, lowercase, через дефис — он становится именем файла. Уникальный.

## Шаг 2 — Расшарить базу с integration

Открой базу → правый верх «Connect» (или ⋯ → Connections) → добавь integration **«Алхимия Анкеты»** (или как у тебя называется тот, что уже работает под `NOTION_TOKEN`).

## Шаг 3 — Скопировать ID базы

URL базы выглядит так: `https://www.notion.so/<workspace>/<DATABASE_ID>?v=...`
Скопируй `DATABASE_ID` — 32-символьная hex-строка с дефисами.

Добавь в Vercel env как `NOTION_STORIES_DB_ID` (Project → Settings → Environment Variables).

## Шаг 4 — Как сотрудник пишет статью

Создаёт новую страницу в базе. Заполняет все поля наверху. Дальше в теле страницы пишет текст через стандартные блоки Notion:

| Что нужно в статье | Какой Notion-блок |
|---|---|
| **Раздел (большой заголовок)** | `Heading 2` |
| **Подзаголовок внутри раздела** | `Heading 3` |
| **Абзац обычного текста** | `Paragraph` |
| **Pull-quote (золотая полоска)** | `Quote` (значок \|). Чтобы выделить часть текста золотом — сделай её **bold** внутри quote-блока. |
| **Картинка между абзацами** | `Image` (вставить файл прямо в Notion) |
| **Две картинки рядом с подписями** | `Toggle` с заголовком `figure-pair`. Внутри: image + caption (бытовой текст), снова image + caption. |
| **Финальный блок (выделенный курсивом в рамке)** | `Callout` с заголовком `finale`. Каждая строка — отдельный абзац. Чтобы выделить строку золотом — сделай её **bold**. |

### Особенности

- **Em-dash → en-dash.** Не парься с типом тире — скрипт меняет все «—» на «–» автоматом.
- **Кавычки.** Используй `«…»` (на Mac: Option+Shift+\). Прямые кавычки `"..."` тоже сработают, но «ёлочки» правильнее по бренду.
- **Картинки.** Hero — отдельное поле наверху. Внутри тела — обычные image-блоки, скрипт сам скачает и положит в `images/`.
- **Длина OG title.** До 90 символов (Telegram режет длинное).

## Шаг 5 — Публикация

Сотрудник переключает `Status` на `Ready to publish` и говорит тебе или Лизе.

Ты запускаешь:

```bash
cd /Users/anton/Documents/Claude/Projects/alchemy-alc-30
node scripts/build-from-notion.cjs <slug>
git add stories/<slug>.html images/story-<slug>-*.jpg
git commit -m "story: publish <slug>"
git push
```

Через ~30 секунд статья на проде по адресу `https://wmnalchemy.com/stories/<slug>.html`.

Скрипт сам обновит `Status` → `Published`, `Published at`, `Story URL` в Notion.

## Что после ремейка делать со ссылкой на главной

Voice-card на главной странице (`index.html`) пока правится вручную — добавляешь объект в массив `voices`:

```js
{ story: 'stories/<slug>.html',
  photo: 'images/story-<slug>-hero.jpg',
  text:  '<Voice card quote из Notion>',
  name:  '<Heroine name>',
  who:   '<Heroine role>' }
```

В Фазе 2 это тоже автоматизируем.
