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

## Stories (long-form graduate stories) — full recipe

Reference article: `stories/litvinenko.html` (Евгения Л.) — built from
`stories/src/litvinenko.txt` via `node scripts/build-litvinenko.cjs`.
**Treat it as the gold standard.** When a new story comes in, clone the
build script and adapt — never write HTML by hand.

### File layout (one per story)

```
stories/src/<slug>.txt     # source text from Google Doc (verbatim paste)
scripts/build-<slug>.cjs   # generator (.cjs because package.json is type=module)
stories/<slug>.html        # output — regenerated, never hand-edited
images/story-<name>*.jpg   # hero + inline + figure-pair images
```

### Source-text markup (what goes in the `.txt`)

The build script parses the source line by line. Supported syntax:

| Construct | Source syntax | Output |
|---|---|---|
| **Article title** | first non-blank line | `<h1 class="story-title">` |
| **Promoted intro heading** | the literal line in `PROMOTED_INTRO_HEADING` constant | `<h2>` (treated as a section even without a separator) |
| **Section heading** | line immediately followed by `─────────────────────────────────────────` separator line | `<h2>` |
| **Subheading** | line starts with `► ` | `<h3>` with gold dot bullet, italic serif |
| **Body paragraph** | any non-blank line | `<p>` |
| **Bullet list** | lines start with `* ` | `<ul class="story-contrast">` (cream paper bg, gold left-border) |
| **Pull-quote** | the exact line text registered as a key in the `PULL_QUOTES` Map | `<blockquote class="story-quote">` — italic serif, gold hairlines top+bottom |
| **Inline image** | the exact paragraph text registered as a key in `IMAGE_AFTER` Map | the body `<p>` is followed by `<figure class="story-image">` |
| **Figure-pair** (2 images side-by-side with captions) | `[[figure-pair]] / img: PATH / caption: TEXT / img: PATH / caption: TEXT / [[/figure-pair]]` | CSS grid 1fr 1fr (collapses to 1 col on mobile), italic serif captions below |
| **Finale block** (unified styled conclusion) | `[[finale]] / line 1 / *gold-accented line* / line N / [[/finale]]` | gold hairlines top+bottom, left-aligned, every line italic serif 22–26px, lines with `*…*` render in gold `<em>` |

### Pull-quote and finale gold accent

Wrap the gold-accent fragment in `*asterisks*`. The renderer converts
`*X*` → `<em>X</em>` and `.story-section .story-quote em` / `.story-finale p em`
both colour `<em>` in `var(--gold)`. Asterisks can wrap any subset of the
quote — single word, phrase, whole second sentence — pick whatever the
emphasis is on.

For pull-quotes that arrive in source with surrounding `«…».` guillemets,
register the full quoted form as the Map key but strip the `«»` from the
output-value string (see Литвиненко example for «Я стала смотреть на мужа…»).

### Cleanup the parser does automatically

- BOM removed.
- **Em-dash `—` → en-dash `–` globally** (project brand rule, no exceptions).
- Footnote URL refs `[a]https://...` lines dropped (filter runs BEFORE inline strip so the prefix is still visible to the matcher).
- Inline `[a]`–`[e]` markers stripped from middle/end of lines using `[ \t]*` (not `\s*` — `\s` swallows newlines and merges paragraphs).
- `Вкладка N` lines (Google Doc tab labels) dropped.
- Standalone `[a]`–`[z]` placeholder lines dropped.

### Typography & design tokens

```
--bg:       #f3ece0   (cream page)
--paper:    #faf6ee   (lighter cream for cards)
--ink:      #1c1814   (near-black warm)
--ink-2:    #2a241e
--ink-soft: rgba(28,24,20,0.66)
--gold:     #9a7838
--serif:    'Cormorant Garamond', Georgia, serif
--sans:     'Inter Tight', -apple-system, sans-serif
```

- Container `max-width: 800px`, padding `40px clamp(20px, 5vw, 56px) 96px`
- Hero image: aspect-ratio 16/10 desktop, 4/3 mobile, full container width
- Body paragraphs: Cormorant 20–22px / line-height 1.65
- h2: Cormorant 26–32px, section divider hairline above except first
- h3 subhead: Cormorant italic 22–26px + 8px gold-dot pseudo-bullet
- Pull-quote: Cormorant italic 22–28px, gold hairlines top+bottom, full column width (no inset)
- Finale block: same as pull-quote but left-aligned and shared style across all lines
- Decorative inserts (quote, finale, figure-pair, image, contrast-list) use ~15%-tighter vertical margins than feels default
- **Mobile (≤640px) bumps font sizes ~10%** because `clamp()` minimums land too small for comfortable Cormorant reading on phones. Inside `@media (max-width: 640px)`: body 22px / line-height 1.6, h2 28, h3 23, pull-quote 24, finale 23, contrast 21, figcaption 17.

### Required `<head>` meta — Telegram/social preview

Every story HTML head must include the full OG + Twitter card block.
Constants live at top of build script:

```js
const SITE_ORIGIN = 'https://wmnalchemy.com';
const STORY_URL   = `${SITE_ORIGIN}/stories/<slug>.html`;
const OG_IMAGE    = `${SITE_ORIGIN}${HERO_IMAGE}`;
const OG_TITLE    = '...';   // punchy 1-sentence headline, no «Алхимия» prefix
const OG_DESCRIPTION = '...'; // 1–2 sentences describing the arc, hero name first
```

Emitted tags (order matters for some scrapers):
- `<link rel="canonical">`
- `<meta property="og:type" content="article">`
- `<meta property="og:site_name" content="Алхимия Женщины">`
- `<meta property="og:url">`, `og:title`, `og:description`
- `<meta property="og:image">` with absolute URL, plus `og:image:width`, `og:image:height`, `og:image:alt`
- `<meta property="og:locale" content="ru_RU">`
- `<meta name="twitter:card" content="summary_large_image">` + twitter:title/description/image

**Telegram caches link previews aggressively per-URL.** After deploying
preview changes, refresh via `@WebpageBot` in Telegram — send it the
story URL and it force-refetches the OG tags. Without this, anyone who
shared the link before your change keeps seeing the stale preview.

### Voices section integration (`index.html`)

When publishing a new story, add a card to the `voices` array (top of `index.html` script). Story-card schema:

```js
{ story: 'stories/<slug>.html',
  photo: 'images/story-<name>.jpg',
  text:  '<short headline quote>',
  name:  '<First L.>',
  who:   '<role>' }
```

Story cards render with the «Читать всю историю →» gold-underlined CTA. Order matters — story cards go first.

### Story registry

| Slug | Hero portrait | Inline images | Source | Build script |
|---|---|---|---|---|
| `litvinenko` | `story-evgenia.jpg` | `story-evgenia-couple.jpg`, `story-evgenia-group.jpg`, `story-evgenia-whoop-recovery.jpg`, `story-evgenia-whoop-age.jpg` | `stories/src/litvinenko.txt` | `node scripts/build-litvinenko.cjs` |

### Authoring workflow for a new story

1. **Get source from Liza.** Google Doc paste → `stories/src/<slug>.txt`. Don't reformat — em-dash→en-dash conversion + cleanup is the parser's job.
2. **Save hero portrait + any inline photos** to `images/story-<name>*.jpg`. Don't optimize aggressively — Vercel handles compression at the edge.
3. **Clone build script.** `cp scripts/build-litvinenko.cjs scripts/build-<slug>.cjs`. Update: `SOURCE_TXT`, `OUT_HTML`, `HERO_IMAGE`, `STORY_URL`, `OG_TITLE`, `OG_DESCRIPTION`, `PULL_QUOTES`, `IMAGE_AFTER`, `PROMOTED_INTRO_HEADING`.
4. **Iterate locally.** `node scripts/build-<slug>.cjs`, open the file directly in browser.
5. **Mark up source for the rich blocks:**
   - `►` prefix where you want a subheading
   - `[[figure-pair]] … [[/figure-pair]]` for two-up image grids
   - `[[finale]] … [[/finale]]` for the unified closing block (one per story)
   - Add the exact text of pull-quote lines to `PULL_QUOTES` Map in the script
   - Add the exact text of paragraphs that should be followed by an inline image to `IMAGE_AFTER` Map
6. **Add voice card to `index.html`** with `story:` field pointing to the new HTML.
7. **Commit + PR + squash-merge** (see Dev workflow below). Vercel auto-deploys from `main`.
8. **Refresh Telegram preview cache** via `@WebpageBot` once it's live.

### Never hand-edit `stories/<slug>.html`

It's a generated file. Hand-edits get blown away on next build. Edit
the source `.txt` or the build script.

## Voices section (`index.html`)
- 5 cards in carousel — Евгения first (story card with «Читать всю историю →» link), then Татьяна, Анна, Ирина, Наталья
- Антонина С. testimonial removed (PR #103) — image still on disk at `images/voice-antonina.jpg`
- Story card variant = same photo+quote layout + extra gold-underlined CTA link

## Dev workflow

- Each change → branch off `origin/main` → PR → `gh pr merge <N> --squash`
- **Always cut a fresh branch from `origin/main` per PR.** Don't reuse a previously-merged branch — once `gh pr merge --squash` happens, GitHub rewrites history and your local branch with the original commits conflicts with the new squashed commit on main. Symptom: «Pull request is not mergeable» / merge conflicts on `cjs` and `html` files that haven't visibly diverged.
- If you do get stuck on a stale branch: `git fetch origin main && git checkout -b <new-branch> origin/main`, then cherry-pick or reapply your edits and force-push.
- Vercel auto-deploys from `main` only (usually within ~30s). Pushing to a non-main branch does NOT deploy to prod — only preview. Confirm production deploy by polling `curl -sL "https://wmnalchemy.com/stories/<slug>.html?v=$(date +%s)"`.
- Vercel occasionally debounces close commits — push an empty commit OR `vercel --prod` if stuck.
- Worktree path: `/Users/anton/Documents/Claude/Projects/alchemy-alc-30/`
- Main repo: `/Users/anton/Documents/Claude/Projects/alchemy/` (don't touch — already used by worktree, prevents `gh pr merge --delete-branch` from working since it tries to `git branch -d` against a checked-out branch)

## Outstanding ideas / NOT done yet

- Few-shot examples in letter prompt (await Liza's reference letters)
- Server-side validator with regen + 24 fallback templates (lite version possible if needed)
- Open-text-driven classifier overrides (parked as «v3 idea»)
- Additional stories beyond Литвиненко (multi-source build-articles.cjs once 2+ exist)
