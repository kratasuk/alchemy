# Project context — Алхимия Женщины landing

Living context for future sessions. Updated as work progresses.

## Stack

- Static site on Vercel — domain **wmnalchemy.com**, deploys from `main` branch
- `api/*.js` — Vercel serverless functions
- `index.html` — main landing
- `test.html` — diagnostic quiz (10 questions)
- `stories/*.html` — long-form success stories (generated from `stories/src/*.txt`)
- `oferta.html`, `privacy.html` — legal pages
- `api/_letter.js` — LLM system prompt (v4.7) for the quiz-generated personal letter

## Critical state — DO NOT regress

### Brand rules (CLAUDE.md global)
- **Em-dash → en-dash always** (`—` → `–`). `ё` everywhere grammatical. Quotes `« »`.

### Letter prompt v4.7 (`api/_letter.js`)
- Sonnet 4.6, thinking disabled (latency)
- 7-block architecture: Headline → Узнавание → Где ограничение → Ум vs бытийность → Мост → 3 параграфа «что становится возможным» → Связка с Алхимией → Закрытие
- Push→pull metaphor as core game-changer
- Closing varies by readiness (GREEN/YELLOW = peer meeting, RED = soft refusal with door open)
- Validator: only em-dash auto-replace currently (no regen/fallback yet)

### Quiz schema v3 (`test.html`)
- 10 questions: Q1 prof / Q2 work_pain (multi up to 2) / Q3 income / Q4 relations / Q5 family / Q6 relationship_pain (multi up to 2) / Q7-Q9 open-text dream/obstacles/tried / Q10 contact
- Q2 special value `not_relevant` and Q6 `all_good` = «не боль» (don't diagnose)
- Telegram is optional in Q10

### Notion DB schema (`docs/notion-setup.md`)
- Status select with kanban columns
- Multi-select: Сложности в работе, Сложности в отношениях
- See submit.js for exact property name mapping (Russian)

### Footer (minimal)
- Removed final CTA section + brand block in PR #107
- Only: Публичная оферта · Политика конфиденциальности · ООО «Вуман Проджектс»

## Stories

| Slug | Source | Build script | Featured photo |
|---|---|---|---|
| `litvinenko` | `stories/src/litvinenko.txt` | `node scripts/build-litvinenko.cjs` | Евгения Л., Предприниматель — `images/story-evgenia.jpg` (hero) + `images/story-evgenia-couple.jpg` (inline after «Вот туда мне хотелось.») |

### Pull-quote rules
- `<blockquote class="story-quote">` — italic serif, gold hairlines top+bottom, no background, full column width
- Mark gold-accent fragment in source with `*asterisks*` → renders as gold `<em>`
- Configured in `PULL_QUOTES` Map in build script

### Inline image rules
- `IMAGE_AFTER` Map in build script: paragraph text → image path
- Renders as `<figure class="story-image">` after the matched paragraph

## Voices section (`index.html`)
- 5 cards in carousel — Евгения first (story card with «Читать всю историю →» link), then Татьяна, Анна, Ирина, Наталья
- Антонина С. testimonial removed (PR #103) — image still on disk at `images/voice-antonina.jpg`
- Story card variant = same photo+quote layout + extra gold-underlined CTA link

## Dev workflow

- Each change → branch off `origin/main` → PR → merge with `gh pr merge --squash --admin`
- Vercel auto-deploys from `main` (usually within ~30s, occasionally debounces close commits — push empty commit OR `vercel --prod` if stuck)
- Worktree path: `/Users/anton/Documents/Claude/Projects/alchemy-alc-30/`
- Main repo: `/Users/anton/Documents/Claude/Projects/alchemy/` (don't touch — already used by worktree)

## Outstanding ideas / NOT done yet

- Few-shot examples in letter prompt (await Liza's reference letters)
- Server-side validator with regen + 24 fallback templates (lite version possible if needed)
- Open-text-driven classifier overrides (parked as «v3 idea»)
- Additional stories beyond Литвиненко (multi-source build-articles.cjs once 2+ exist)
