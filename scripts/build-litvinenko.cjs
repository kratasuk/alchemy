// Converts stories/src/litvinenko.txt → stories/litvinenko.html.
// Run: `node scripts/build-litvinenko.js` from repo root.
// Replaces em-dash → en-dash, drops [a]-[e] image placeholders,
// parses section headings (lines followed by ─────), and supports:
//   • PULL_QUOTES — full-sentence matches → blockquote with gold accent
//   • IMAGE_AFTER — paragraph text → emit <img> immediately after that line

const fs = require('node:fs');
const path = require('node:path');

const SOURCE_TXT = path.join(__dirname, '..', 'stories', 'src', 'litvinenko.txt');
const OUT_HTML = path.join(__dirname, '..', 'stories', 'litvinenko.html');

const SITE_TITLE = 'История выпускницы – Алхимия Женщины';
const BACK_HREF = '/';
const BACK_TEXT = '← Алхимия Женщины';
const HERO_IMAGE = '/images/story-evgenia.jpg';

// Pull-quote map (full-sentence text → marked-up version with *gold accent*).
// Wrap the gold-accent fragment in *asterisks* to mark it inline.
const PULL_QUOTES = new Map([
  ['Если бы моя жизнь сейчас закончилась – чем я по-настоящему горжусь и что ещё хочу успеть улучшить?',
   'Если бы моя жизнь сейчас закончилась – *чем я по-настоящему горжусь и что ещё хочу успеть улучшить?*'],
  ['Я поняла: следующий уровень счастья для меня – отношения, где я желанная женщина.',
   'Я поняла: следующий уровень счастья для меня – *отношения, где я желанная женщина.*']
]);

// After these paragraphs, emit an extra <img>. Paragraph text → image path.
// Match is against the cleaned-up paragraph text (after inline [a-e] strip,
// em-dash → en-dash, trim).
const IMAGE_AFTER = new Map([
  ['Вот туда мне хотелось.', '/images/story-evgenia-couple.jpg'],
  ['С Елизаветой я с 2018 года: прошла многие её программы, была куратором на некоторых – и видела, какая она в работе, в жизни.', '/images/story-evgenia-group.jpg']
]);

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function buildArticle() {
  let text = fs.readFileSync(SOURCE_TXT, 'utf8');

  // BOM
  text = text.replace(/^﻿/, '');

  // Project rule: em-dash → en-dash (everywhere, including in dialogue)
  text = text.replace(/—/g, '–');

  // Drop footnote URL refs first ([a]https://… lines) BEFORE the inline
  // [a]-[e] strip would erase the prefix and leave a stray URL paragraph.
  text = text.split('\n').filter(l => {
    const t = l.trim();
    if (/^\[[a-z]\]$/.test(t)) return false;
    if (/^\[[a-z]\]https?:\/\//.test(t)) return false;
    if (/^Вкладка \d+$/.test(t)) return false;
    return true;
  }).join('\n');

  // Strip inline image placeholder markers [a]-[e] that appear in the middle
  // or end of lines (Google Docs footnote-style refs to embedded images).
  // Use [ \t] not \s so we don't accidentally swallow line breaks and merge
  // adjacent paragraphs.
  text = text.replace(/[ \t]*\[[a-e]\][ \t]*/g, ' ').replace(/[ \t]+$/gm, '');

  const lines = text.split('\n').map(l => l.trim());

  // Parse: title = first non-blank line
  let cursor = 0;
  while (cursor < lines.length && !lines[cursor]) cursor++;
  const title = lines[cursor++];

  // Following lines until "Я была сильной…" are intro paragraphs.
  // The intro section has a stylistic lead-in line «Когда я пришла…» —
  // we promote it to an h2 like the explicit ─── headings.
  const PROMOTED_INTRO_HEADING = 'Когда я пришла в «Алхимию Женщины», у меня не было ощущения, что моя жизнь разваливается';

  const sections = []; // each: { heading, blocks: [...] }
  let current = { heading: null, blocks: [] };

  function flush() {
    if (current.heading || current.blocks.length) sections.push(current);
    current = { heading: null, blocks: [] };
  }

  let i = cursor;
  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1] || '';

    if (!line) { i++; continue; }

    // Heading detection: line followed by ─── separator
    const isHeadingViaSeparator = /^─+$/.test(next);
    const isHeadingViaIntroPromote = line === PROMOTED_INTRO_HEADING;

    if (isHeadingViaSeparator || isHeadingViaIntroPromote) {
      flush();
      current.heading = line;
      i += isHeadingViaSeparator ? 2 : 1;
      continue;
    }

    if (/^─+$/.test(line)) { i++; continue; }

    // Finale block: a unified hairline-bordered styled statement at the end.
    // [[finale]]
    // line 1
    // *line 2 in gold*
    // attr lines …
    // [[/finale]]
    if (line === '[[finale]]') {
      i++;
      const finaleLines = [];
      while (i < lines.length && lines[i] !== '[[/finale]]') {
        if (lines[i]) finaleLines.push(lines[i]);
        i++;
      }
      if (i < lines.length && lines[i] === '[[/finale]]') i++;
      current.blocks.push({ type: 'finale', lines: finaleLines });
      continue;
    }

    // Figure-pair block: two images side-by-side with captions
    // [[figure-pair]]
    // img: /path.jpg
    // caption: …
    // img: /path.jpg
    // caption: …
    // [[/figure-pair]]
    if (line === '[[figure-pair]]') {
      i++;
      const items = [];
      let cur = null;
      while (i < lines.length && lines[i] !== '[[/figure-pair]]') {
        const l = lines[i];
        const mImg = l.match(/^img:\s*(.+)$/);
        const mCap = l.match(/^caption:\s*(.+)$/);
        if (mImg) {
          if (cur) items.push(cur);
          cur = { src: mImg[1].trim(), caption: '' };
        } else if (mCap && cur) {
          cur.caption = mCap[1].trim();
        }
        i++;
      }
      if (cur) items.push(cur);
      if (i < lines.length && lines[i] === '[[/figure-pair]]') i++;
      current.blocks.push({ type: 'figure-pair', items });
      continue;
    }

    // Bullet list start: line begins with "*"
    if (/^\*\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\*\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\*\s+/, ''));
        i++;
      }
      current.blocks.push({ type: 'ul', items });
      continue;
    }

    // The closing list "Сильной и расслабленной…" — short colon-and-attrs lines
    // We detect by: line ends with "может быть:" → next lines are items
    if (/может быть:$/.test(line)) {
      current.blocks.push({ type: 'p', text: line });
      i++;
      const items = [];
      while (i < lines.length && lines[i] && !/^─+$/.test(lines[i])) {
        // Stop if next is a heading (line followed by ─── or matches intro promote)
        if (i + 1 < lines.length && /^─+$/.test(lines[i+1])) break;
        if (lines[i] === PROMOTED_INTRO_HEADING) break;
        // These items are short sentences without periods often
        items.push(lines[i]);
        i++;
      }
      if (items.length) current.blocks.push({ type: 'closing-list', items });
      continue;
    }

    // Subheading: line starts with ► glyph (inside a section, between h2 and body)
    if (/^►\s*/.test(line)) {
      const subhead = line.replace(/^►\s*/, '').trim();
      current.blocks.push({ type: 'h3', text: subhead });
      i++;
      continue;
    }

    // Standalone short italicized-style sentence (pull quote candidate):
    // detect short impactful sentences. For now treat everything as <p>.
    current.blocks.push({ type: 'p', text: line });
    i++;
  }
  flush();

  // Render
  const out = [];
  out.push(`<!doctype html>`);
  out.push(`<html lang="ru">`);
  out.push(`<head>`);
  out.push(`<meta charset="utf-8">`);
  out.push(`<meta name="viewport" content="width=device-width, initial-scale=1">`);
  out.push(`<title>${escapeHtml(SITE_TITLE)}</title>`);
  out.push(`<meta name="description" content="${escapeHtml(title)}">`);
  out.push(`<meta name="robots" content="noindex">`);
  out.push(`<link rel="icon" type="image/svg+xml" href="/images/favicon.svg">`);
  out.push(`<link rel="preconnect" href="https://fonts.googleapis.com">`);
  out.push(`<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`);
  out.push(`<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter+Tight:wght@400;500;600&display=swap" rel="stylesheet">`);
  out.push(`<style>`);
  out.push(`  :root {
    --bg: #f3ece0;
    --paper: #faf6ee;
    --ink: #1c1814;
    --ink-2: #2a241e;
    --ink-soft: rgba(28, 24, 20, 0.66);
    --ink-faint: rgba(28, 24, 20, 0.42);
    --ink-hair: rgba(28, 24, 20, 0.14);
    --gold: #9a7838;
    --serif: 'Cormorant Garamond', Georgia, serif;
    --sans: 'Inter Tight', -apple-system, sans-serif;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--ink);
    font-family: var(--sans);
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  .story-page {
    max-width: 800px;
    margin: 0 auto;
    padding: 40px clamp(20px, 5vw, 56px) 96px;
  }
  .story-back {
    display: inline-block;
    font-family: var(--sans);
    font-size: 13px;
    letter-spacing: 0.02em;
    color: var(--ink-soft);
    text-decoration: none;
    margin-bottom: 56px;
    padding: 4px 0;
    transition: color .2s;
  }
  .story-back:hover { color: var(--ink); }

  .story-title {
    font-family: var(--serif);
    font-weight: 500;
    font-size: clamp(34px, 4vw, 52px);
    line-height: 1.15;
    color: var(--ink);
    margin-bottom: 24px;
    letter-spacing: -0.01em;
    text-wrap: balance;
  }
  /* Hero image – wide, sits between title and the first section */
  .story-hero {
    width: 100%;
    margin: 36px 0 56px;
    border-radius: 8px;
    overflow: hidden;
  }
  .story-hero img {
    width: 100%;
    height: auto;
    display: block;
    aspect-ratio: 16 / 10;
    object-fit: cover;
  }

  .story-section {
    margin-bottom: 48px;
  }
  .story-section h2 {
    font-family: var(--serif);
    font-weight: 500;
    font-size: clamp(26px, 2.4vw, 32px);
    line-height: 1.25;
    color: var(--ink);
    margin: 64px 0 28px;
    letter-spacing: -0.005em;
    text-wrap: balance;
  }
  .story-section h2:first-child { margin-top: 0; }

  /* Subheading inside a section — between h2 and body paragraphs.
     Visually smaller than h2, no border-top reset; gold accent dot on the left. */
  .story-section h3 {
    font-family: var(--serif);
    font-weight: 500;
    font-style: italic;
    font-size: clamp(22px, 1.75vw, 26px);
    line-height: 1.3;
    color: var(--ink);
    margin: 48px 0 18px;
    letter-spacing: -0.005em;
    text-wrap: balance;
    position: relative;
    padding-left: 18px;
  }
  .story-section h3::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0.55em;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--gold);
  }

  /* Section divider – subtle gold hairline above heading */
  .story-section + .story-section h2 {
    padding-top: 64px;
    border-top: 1px solid rgba(154, 120, 56, 0.25);
  }

  .story-section p {
    font-family: var(--serif);
    font-size: clamp(20px, 1.5vw, 22px);
    line-height: 1.65;
    color: var(--ink-2);
    margin-bottom: 22px;
    text-wrap: pretty;
    hanging-punctuation: first last;
  }

  /* Pull-quote — italic serif with thin gold hairlines top + bottom,
     key phrase in gold accent. Same column width as body text;
     no horizontal padding or margin. */
  .story-section .story-quote {
    margin-block: 56px;
    margin-inline: 0;
    padding-block: clamp(36px, 4.5vw, 56px);
    padding-inline: 0;
    background: transparent;
    border-top: 1px solid rgba(154, 120, 56, 0.45);
    border-bottom: 1px solid rgba(154, 120, 56, 0.45);
    font-family: var(--serif);
    font-style: italic;
    font-size: clamp(22px, 1.85vw, 28px);
    line-height: 1.45;
    color: var(--ink);
  }
  .story-section .story-quote em {
    color: var(--gold);
    font-style: italic;
  }

  /* Finale block — unified italic statement with gold hairlines top + bottom.
     Every line shares the same size and style for a continuous read. */
  .story-section .story-finale {
    margin: 64px 0 24px;
    padding: clamp(40px, 5vw, 60px) 0;
    border-top: 1px solid rgba(154, 120, 56, 0.45);
    border-bottom: 1px solid rgba(154, 120, 56, 0.45);
    text-align: center;
  }
  .story-section .story-finale p {
    font-family: var(--serif);
    font-style: italic;
    font-size: clamp(22px, 1.7vw, 26px);
    line-height: 1.55;
    color: var(--ink);
    margin: 8px 0;
    text-wrap: pretty;
  }
  .story-section .story-finale p em {
    color: var(--gold);
    font-style: italic;
  }

  /* Figure-pair: two images side-by-side with italic serif captions below. */
  .story-section .story-figure-pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin: 48px 0;
  }
  .story-section .story-figure-pair figure {
    margin: 0;
    display: flex;
    flex-direction: column;
  }
  .story-section .story-figure-pair img {
    width: 100%;
    height: auto;
    display: block;
    border-radius: 8px;
    background: #0a0d10;
  }
  .story-section .story-figure-pair figcaption {
    margin-top: 14px;
    font-family: var(--serif);
    font-style: italic;
    font-size: clamp(16px, 1.15vw, 18px);
    line-height: 1.45;
    color: var(--ink-soft);
    text-wrap: pretty;
  }
  @media (max-width: 640px) {
    .story-section .story-figure-pair {
      grid-template-columns: 1fr;
      gap: 28px;
    }
  }

  /* Inline image inside an article section (rendered via IMAGE_AFTER map). */
  .story-section .story-image {
    margin: 48px 0;
    border-radius: 8px;
    overflow: hidden;
  }
  .story-section .story-image img {
    width: 100%;
    height: auto;
    display: block;
  }

  /* Bullet list with contrast (Не X → А Y) */
  .story-section ul.story-contrast {
    list-style: none;
    margin: 28px 0;
    padding: 24px 28px;
    background: var(--paper);
    border-radius: 12px;
    border-left: 2px solid var(--gold);
  }
  .story-section ul.story-contrast li {
    font-family: var(--serif);
    font-size: clamp(19px, 1.4vw, 21px);
    line-height: 1.55;
    color: var(--ink-2);
    padding: 8px 0;
    text-wrap: pretty;
  }
  .story-section ul.story-contrast li + li {
    border-top: 1px solid rgba(154, 120, 56, 0.15);
  }

  /* Closing list (Сильной и расслабленной…) */
  .story-section ul.story-attrs {
    list-style: none;
    margin: 24px 0;
    padding: 0;
  }
  .story-section ul.story-attrs li {
    font-family: var(--serif);
    font-style: italic;
    font-size: clamp(22px, 1.7vw, 26px);
    line-height: 1.4;
    color: var(--ink);
    padding: 6px 0;
    text-align: center;
  }

  @media (max-width: 640px) {
    .story-page { padding: 30px 22px 72px; }
    .story-back { margin-bottom: 36px; }
    .story-title { font-size: clamp(28px, 8vw, 36px); }
    .story-hero img { aspect-ratio: 4 / 3; }
  }`);
  out.push(`</style>`);
  out.push(`</head>`);
  out.push(`<body>`);
  out.push(`<main class="story-page">`);
  out.push(`<a class="story-back" href="${BACK_HREF}">${escapeHtml(BACK_TEXT)}</a>`);
  out.push(`<h1 class="story-title">${escapeHtml(title)}</h1>`);
  out.push(`<div class="story-hero"><img src="${HERO_IMAGE}" alt=""></div>`);

  for (const section of sections) {
    out.push(`<section class="story-section">`);
    if (section.heading) {
      out.push(`<h2>${escapeHtml(section.heading)}</h2>`);
    }
    for (const block of section.blocks) {
      if (block.type === 'p') {
        if (PULL_QUOTES.has(block.text)) {
          // Convert *gold accent* → <em> (rendered as gold-color italic).
          const marked = PULL_QUOTES.get(block.text);
          const html = escapeHtml(marked).replace(/\*([^*]+)\*/g, '<em>$1</em>');
          out.push(`<blockquote class="story-quote">${html}</blockquote>`);
        } else {
          out.push(`<p>${escapeHtml(block.text)}</p>`);
        }
        // Emit an inline image right after this paragraph if registered.
        if (IMAGE_AFTER.has(block.text)) {
          const src = IMAGE_AFTER.get(block.text);
          out.push(`<figure class="story-image"><img src="${src}" alt="" loading="lazy"></figure>`);
        }
      } else if (block.type === 'h3') {
        out.push(`<h3>${escapeHtml(block.text)}</h3>`);
      } else if (block.type === 'finale') {
        out.push(`<div class="story-finale">`);
        for (const ln of block.lines) {
          const html = escapeHtml(ln).replace(/\*([^*]+)\*/g, '<em>$1</em>');
          out.push(`  <p>${html}</p>`);
        }
        out.push(`</div>`);
      } else if (block.type === 'figure-pair') {
        out.push(`<div class="story-figure-pair">`);
        for (const it of block.items) {
          out.push(`  <figure>`);
          out.push(`    <img src="${it.src}" alt="" loading="lazy">`);
          if (it.caption) out.push(`    <figcaption>${escapeHtml(it.caption)}</figcaption>`);
          out.push(`  </figure>`);
        }
        out.push(`</div>`);
      } else if (block.type === 'ul') {
        out.push(`<ul class="story-contrast">`);
        for (const item of block.items) {
          out.push(`  <li>${escapeHtml(item)}</li>`);
        }
        out.push(`</ul>`);
      } else if (block.type === 'closing-list') {
        out.push(`<ul class="story-attrs">`);
        for (const item of block.items) {
          out.push(`  <li>${escapeHtml(item)}</li>`);
        }
        out.push(`</ul>`);
      }
    }
    out.push(`</section>`);
  }

  out.push(`</main>`);
  out.push(`</body>`);
  out.push(`</html>`);

  return out.join('\n');
}

const html = buildArticle();
const outDir = 'stories';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'litvinenko.html'), html);
console.log('Wrote stories/litvinenko.html, len:', html.length);
