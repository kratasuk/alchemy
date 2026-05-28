// Converts stories/src/litvinenko.txt → stories/litvinenko.html.
// Run: `node scripts/build-litvinenko.cjs` from repo root.
//
// Replaces em-dash → en-dash, drops [a]-[e] image placeholders, parses
// section headings (lines followed by ─────), and supports:
//   • PULL_QUOTES — full-sentence matches → blockquote with gold accent
//   • IMAGE_AFTER — paragraph text → emit <img> immediately after that line
//   • [[figure-pair]] — side-by-side images with captions
//   • [[finale]]     — unified italic finale block
//
// The actual HTML rendering lives in scripts/lib/render-story.cjs so it's
// shared with build-from-notion.cjs.

const fs = require('node:fs');
const path = require('node:path');
const { renderStoryHtml } = require('./lib/render-story.cjs');

const SOURCE_TXT = path.join(__dirname, '..', 'stories', 'src', 'litvinenko.txt');
const OUT_HTML = path.join(__dirname, '..', 'stories', 'litvinenko.html');

const SLUG = 'litvinenko';
const HERO_IMAGE = '/images/story-evgenia.jpg';
const HERO_DIMS = { width: 1702, height: 1143 };
const HERO_ALT = 'Евгения, выпускница Алхимии Женщины';
const OG_TITLE = 'После 25 лет вместе мы вышли на новый уровень близости и взаимопонимания с мужем';
const OG_DESCRIPTION = 'История Евгении – о том, как она перестала быть «руководителем» дома, перестроила свои отношения и научилась притягивать, а не проталкивать.';

// Pull-quote map (full-sentence text → marked-up version with *gold accent*).
// Wrap the gold-accent fragment in *asterisks* to mark it inline.
const PULL_QUOTES = new Map([
  ['Если бы моя жизнь сейчас закончилась – чем я по-настоящему горжусь и что ещё хочу успеть улучшить?',
   'Если бы моя жизнь сейчас закончилась – *чем я по-настоящему горжусь и что ещё хочу успеть улучшить?*'],
  ['Примерно через полтора месяца я снова попала к своей массажистке. Она положила руки и без предисловий спросила: «Что вы такого начали делать? У вас тело другое».',
   'Примерно через полтора месяца я снова попала к своей массажистке. Она положила руки и без предисловий спросила: «Что вы такого начали делать? *У вас тело другое».*'],
  ['Если бы ты на минуту поменялась с мужем местами – ты бы захотела жить рядом с такой женщиной, какая ты сейчас?',
   'Если бы ты на минуту поменялась с мужем местами – *ты бы захотела жить рядом с такой женщиной, какая ты сейчас?*'],
  ['«Я стала смотреть на мужа глазами женщины, которая признала его на первом, законном месте. Появилось уважение к тому, что важно ему».',
   'Я стала смотреть на мужа глазами женщины, которая признала его на первом, законном месте. *Появилось уважение к тому, что важно ему.*']
]);

const IMAGE_AFTER = new Map([
  ['Вот туда мне хотелось.', '/images/story-evgenia-couple.jpg'],
  ['С Елизаветой я с 2018 года: прошла многие её программы, была куратором на некоторых – и видела, какая она в работе, в жизни.', '/images/story-evgenia-group.jpg']
]);

const PROMOTED_INTRO_HEADING = 'Когда я пришла в «Алхимию Женщины», у меня не было ощущения, что моя жизнь разваливается';

function buildIR() {
  let text = fs.readFileSync(SOURCE_TXT, 'utf8');
  text = text.replace(/^﻿/, '');
  text = text.replace(/—/g, '–');

  // Drop footnote URL refs first ([a]https://… lines).
  text = text.split('\n').filter(l => {
    const t = l.trim();
    if (/^\[[a-z]\]$/.test(t)) return false;
    if (/^\[[a-z]\]https?:\/\//.test(t)) return false;
    if (/^Вкладка \d+$/.test(t)) return false;
    return true;
  }).join('\n');

  text = text.replace(/[ \t]*\[[a-e]\][ \t]*/g, ' ').replace(/[ \t]+$/gm, '');

  const lines = text.split('\n').map(l => l.trim());
  let cursor = 0;
  while (cursor < lines.length && !lines[cursor]) cursor++;
  const title = lines[cursor++];

  const sections = [];
  let current = { heading: null, blocks: [] };
  const flush = () => {
    if (current.heading || current.blocks.length) sections.push(current);
    current = { heading: null, blocks: [] };
  };

  let i = cursor;
  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1] || '';
    if (!line) { i++; continue; }

    const isHeadingViaSeparator = /^─+$/.test(next);
    const isHeadingViaIntroPromote = line === PROMOTED_INTRO_HEADING;
    if (isHeadingViaSeparator || isHeadingViaIntroPromote) {
      flush();
      current.heading = line;
      i += isHeadingViaSeparator ? 2 : 1;
      continue;
    }
    if (/^─+$/.test(line)) { i++; continue; }

    // [[finale]] block
    if (line === '[[finale]]') {
      i++;
      const finaleLines = [];
      while (i < lines.length && lines[i] !== '[[/finale]]') {
        if (lines[i]) {
          const m = lines[i].match(/^\*(.+)\*$/);
          if (m) finaleLines.push({ text: m[1], gold: true });
          else finaleLines.push({ text: lines[i], gold: false });
        }
        i++;
      }
      if (i < lines.length && lines[i] === '[[/finale]]') i++;
      current.blocks.push({ type: 'finale', lines: finaleLines });
      continue;
    }

    // [[figure-pair]] block
    if (line === '[[figure-pair]]') {
      i++;
      const items = [];
      let cur = null;
      while (i < lines.length && lines[i] !== '[[/figure-pair]]') {
        const l = lines[i];
        const mImg = l.match(/^img:\s*(.+)$/);
        const mCap = l.match(/^caption:\s*(.+)$/);
        if (mImg) { if (cur) items.push(cur); cur = { src: mImg[1].trim(), caption: '' }; }
        else if (mCap && cur) cur.caption = mCap[1].trim();
        i++;
      }
      if (cur) items.push(cur);
      if (i < lines.length && lines[i] === '[[/figure-pair]]') i++;
      current.blocks.push({ type: 'figure-pair', items });
      continue;
    }

    // Bullet list
    if (/^\*\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\*\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\*\s+/, ''));
        i++;
      }
      current.blocks.push({ type: 'ul', items });
      continue;
    }

    // h3 (► glyph)
    if (/^►\s*/.test(line)) {
      current.blocks.push({ type: 'h3', text: line.replace(/^►\s*/, '').trim() });
      i++;
      continue;
    }

    // Pull-quote (exact match in PULL_QUOTES map)
    if (PULL_QUOTES.has(line)) {
      const marked = PULL_QUOTES.get(line);
      const m = marked.match(/\*([^*]+)\*/);
      const goldFragment = m ? m[1] : null;
      const cleanText = marked.replace(/\*/g, '');
      current.blocks.push({ type: 'quote', text: cleanText, goldFragment });
      i++;
      continue;
    }

    // Plain paragraph + maybe an inline image after it
    current.blocks.push({ type: 'p', text: line });
    if (IMAGE_AFTER.has(line)) {
      current.blocks.push({ type: 'image', src: IMAGE_AFTER.get(line), alt: '' });
    }
    i++;
  }
  flush();

  return {
    slug: SLUG,
    title,
    ogTitle: OG_TITLE,
    ogDescription: OG_DESCRIPTION,
    heroImage: HERO_IMAGE,
    heroImageDimensions: HERO_DIMS,
    heroAlt: HERO_ALT,
    sections,
  };
}

// Export the parser so other scripts (e.g. one-off Notion seeding) can reuse it.
module.exports = { buildIR, PULL_QUOTES, IMAGE_AFTER };

// Only run as a CLI when invoked directly.
if (require.main === module) {
  const ir = buildIR();
  const html = renderStoryHtml(ir);
  fs.mkdirSync(path.dirname(OUT_HTML), { recursive: true });
  fs.writeFileSync(OUT_HTML, html);
  console.log(`Wrote ${path.relative(process.cwd(), OUT_HTML)}, len: ${html.length}`);
}
