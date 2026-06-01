# Алхимия Женщины

RU-лендинг 14-недельной программы Елизаветы Бабановой «Алхимия Женщины» + квиз/анкета + диагностический тест.

- **Live:** [alchemy-psi-five.vercel.app](https://alchemy-psi-five.vercel.app)
- **Linear project:** [Алхимия Женщины – Landing & Funnel](https://linear.app/kratasuk/project/alhimiya-zhenshiny-landing-and-funnel-68744dbe582c)
- **Team key:** `ALC`

## Структура репозитория

| Файл / папка | Назначение |
|---|---|
| [`index.html`](index.html) | Канонический АЖ-лендинг |
| [`test.html`](test.html) | Диагностический тест («Подать заявку» в hero) |
| [`stories/`](stories) | Long-form истории выпускниц (генерируются из Notion / txt) |
| [`scripts/`](scripts) | Генераторы статей (`build-from-notion.cjs`, `lib/render-story.cjs`) |
| [`images/`](images) | Все ассеты лендинга, квиза и историй |
| [`.github/pull_request_template.md`](.github/pull_request_template.md) | Шаблон для всех PR |

> `eliza.html` / `quiz.html` (ранний EN-прототип «True Abundance») удалены с RU-домена 2026-06-02. Копии — в `WORK AREAS/Marketing/wmnalchemy-en-project/_reference-en-prototype/`.

Статический сайт. Build-step нет: HTML/CSS/JS грузятся напрямую с CDN.

## Deploy

`main` → **Vercel auto-deploy** → `alchemy-psi-five.vercel.app`

- Каждый merge в `main` → деплой в prod за ~2 мин
- Каждый PR → preview-URL комментарием от `vercel[bot]`
- Vercel-проект подключён к `kratasuk/alchemy` с 2026-05-12 (Issue linking + Code access)

## Workflow

Работа над сайтом отслеживается через Linear-issues `ALC-N`. Branch convention:

```
alc-<N>-<slug>
```

Например `alc-4-about-copy` авто-аттачится к [ALC-4](https://linear.app/kratasuk/issue/ALC-4).

Каждый PR следует [pull request template](.github/pull_request_template.md) — секции `What`, `Why`, `Linear issue`, `Acceptance criteria`, `Preview URL`, `Risk`, `Test plan`, `Intentionally not done`, `Agent involvement`, `Follow-up issues`. Полный workflow-стандарт — в памяти Claude (`feedback_linear_workflow`).

## Style rules

Жёсткие правила, проверяются перед merge:

- **No em-dash «—»** (U+2014) — используется только en-dash «–» (U+2013). Везде: копия, код, комментарии
- **No-cheese tone** — без goop / spiritual-cliché лексики. Сухой, точный, редакционный язык
- **Hero composition** — портрет Лизы и body-text не накладываются друг на друга (либо split layout, либо offset portrait)
- **Typography tokens** (см. `index.html` `<style>` блок: `--gold #9a7838`, `--ink #1c1814`, sans-serif Inter Tight, serif Cormorant Garamond)

## Связанные репозитории

- [`kratasuk/eliza-babanova`](https://github.com/kratasuk/eliza-babanova) — research-артефакты (Audience_Portrait, Brand_Vocabulary, Landing_Copy, Custdev, Positioning, Design_System, АЖ_*, Алхимия_женщины_*) и отдельные эксперименты EN-направления
