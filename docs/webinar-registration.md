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
| `api/webinar-digest.js` | сводка за сутки одним сообщением в Telegram |
| `api/_skv.js` | клиент SKV для серверных функций |
| `api/_event.js` | какое событие сейчас идёт |

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
например `gap = money` или `energy = burnout`. Удаление в SKV мягкое: узел с
`removed = 1` остаётся в дереве, поэтому такие карточки в рассылку брать нельзя.

## Переменные окружения (Vercel)

Новые: `SKV_API_KEY` (ключ SKV), опционально `SKV_TREE` (по умолчанию `alchemy`)
и `SKV_BASE_URL`. Уже были: `TG_BOT_TOKEN`, `TG_GROUP_CHAT_ID`, `TG_BOT_USERNAME`,
`TG_WEBHOOK_SECRET`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`.

## Сводка вместо уведомлений

На каждую регистрацию команде ничего не приходит. Раз в сутки, в 20:30 UTC
(23:30 по Москве), Vercel дёргает `/api/webinar-digest`, и в чат уходит одно
сообщение: сколько записалось за сутки, сколько из них дошло до бота, сколько
всего, и проценты по каждой категории анкеты. Расписание в `vercel.json`.

Руками сводку можно запросить так: `/api/webinar-digest?key=<TG_WEBHOOK_SECRET>`,
а с `&dry=1` она посчитается и вернётся ответом, ничего не отправляя.

Свой крон Vercel опознаётся по трём признакам: заголовок `x-vercel-cron`,
user-agent `vercel-cron/1.0` и, если в среде задан `CRON_SECRET`, заголовок
`Authorization: Bearer <CRON_SECRET>`. Проверять только `x-vercel-cron` нельзя:
node-функция его не видит, и 04.09 крон отработал, но получил от нас 401 и
сводка не ушла. Отказ теперь пишет в лог user-agent, чтобы это было видно сразу.

## Если SKV недоступен

Регистрация всё равно проходит: ответы лежат в Redis (`webinar:<токен>`, 30 дней)
и в очереди `skv-outbox`. Из очереди дозаливаем потом, ничего не теряется. Сводка
при этом недосчитается тех, кто не доехал до SKV.
