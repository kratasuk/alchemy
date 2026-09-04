# Регистрация на вебинар: как устроено

Путь человека: кнопка на `/webinar` → анкета `/webinar/anketa` → «Подтвердить в
Telegram» → бот. Телеграм мы узнаём только на последнем шаге, поэтому кнопка в
конце обязательна: без неё человек в базу рассылки не попадает.

## Файлы

| Файл | Что делает |
|---|---|
| `webinar/anketa/index.html` | анкета, 10 экранов, один тап на вопрос |
| `api/webinar-submit.js` | приём ответов: Redis + SKV + уведомление команде |
| `api/telegram-webhook.js` | `/start w<токен>` → карточка человека в SKV |
| `api/_skv.js` | клиент SKV для серверных функций |

## Вопросы и коды ответов

| Поле | Вопрос | Значения |
|---|---|---|
| `age` | Сколько вам лет | `under_35` `35_40` `40_45` `45_50` `50_plus` |
| `gap` | Наибольший разрыв между «как есть» и «как хочу» | `body` `money` `relations` |
| `energy` | Уровень энергии за последний год | `burnout` `low` `mid` `good` `high` |
| `prof` | Чем заняты профессионально | `top` `manager` `owner` `expert` `transition` `family` |
| `work_pain` | Что сложнее всего в работе (1–2) | `low_income` `overwork` `role_ceiling` `operational_lock` `meaning_lost` `not_relevant` |
| `income` | Средний доход в месяц | `under_100` `100_300` `300_1m` `1_3m` `3m_plus` |
| `relations` | Личная жизнь | `married_good` `married_issues` `single_choice` `single_seeking` `recent_split` |
| `family` | Дети | `kids_small` `kids_school` `kids_adult` `no_kids` `considering` |
| `name` | Как вас зовут | текст |
| `want` | Что хотите изменить за ближайший год | текст, от 10 знаков |

Коды `prof`, `work_pain`, `income`, `relations`, `family` совпадают с анкетой
Алхимии (`test.html`) – это сделано нарочно, чтобы обе базы сегментировались
одинаково.

## Дерево SKV `alchemy`

```
alchemy
├─ people
│   └─ people.tg<chat_id>          карточка человека = база рассылки
│        name · tg_id · tg_username · tg_name · subscribed · last_event
│        age · gap · energy · prof · work_pain · income · relations · family · want · labels
└─ webinar
    └─ webinar.2026-10-03
         └─ webinar.2026-10-03.<токен>   одна регистрация
              те же ответы + ts · status (new → confirmed) · source · confirmed
```

Почему отдельное дерево: правило «один проект – одно дерево». В `eliza` живёт
личная операционка Лизы (портал, горизонты, тело), туда база аудитории не идёт.
Следующее событие получает свою ветку `webinar.<дата>`, а человек остаётся один:
карточка обновляется, `last_event` показывает последнее событие.

Выборка для рассылки: взять детей `people` и отфильтровать по нужному полю,
например `gap = money` или `energy = burnout`.

## Переменные окружения (Vercel)

Новые: `SKV_API_KEY` (ключ SKV), опционально `SKV_TREE` (по умолчанию `alchemy`)
и `SKV_BASE_URL`. Уже были: `TG_BOT_TOKEN`, `TG_GROUP_CHAT_ID`, `TG_BOT_USERNAME`,
`TG_WEBHOOK_SECRET`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`.

## Если SKV недоступен

Регистрация всё равно проходит: ответы лежат в Redis (`webinar:<токен>`, 30 дней)
и в очереди `skv-outbox`, уведомление команде уходит. Из очереди дозаливаем потом,
ничего не теряется.
