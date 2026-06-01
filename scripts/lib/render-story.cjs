// scripts/lib/render-story.cjs
// Renders a story article (HTML) from a structured IR.
// Shared between scripts/build-litvinenko.cjs (txt source) and
// scripts/build-from-notion.cjs (Notion API source).
//
// IR shape — see scripts/lib/IR.md or the JSDoc below.

/**
 * @typedef {Object} StoryIR
 * @property {string} slug            URL slug (used for og:url canonical)
 * @property {string} title           h1 of the article
 * @property {string} ogTitle         <meta property="og:title">
 * @property {string} ogDescription   <meta property="og:description">
 * @property {string} heroImage       absolute path beginning with /
 * @property {{width:number,height:number}=} heroImageDimensions
 * @property {string=} heroAlt
 * @property {Section[]} sections
 *
 * @typedef {Object} Section
 * @property {string|null} heading    null = intro section (no h2)
 * @property {Block[]} blocks
 *
 * @typedef {{type:'p',text:string}
 *   | {type:'h3',text:string}
 *   | {type:'quote',text:string,goldFragment:string|null}
 *   | {type:'image',src:string,alt?:string}
 *   | {type:'figure-pair',items:Array<{src:string,caption:string}>}
 *   | {type:'finale',lines:Array<{text:string,gold:boolean}>}
 *   | {type:'ul',items:string[]}
 * } Block
 */

const SITE_TITLE = 'История выпускницы – Алхимия Женщины';
const BACK_HREF = '/';
const BACK_TEXT = '← Алхимия Женщины';
const CTA_HREF = '/test.html';
const CTA_TEXT = 'Узнайте, подходит ли Алхимия вам';
const SITE_ORIGIN = 'https://wmnalchemy.com';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function renderHead(ir) {
  const storyUrl = `${SITE_ORIGIN}/stories/${ir.slug}.html`;
  const ogImage = ir.heroImage.startsWith('http') ? ir.heroImage : `${SITE_ORIGIN}${ir.heroImage}`;
  const lines = [
    `<!doctype html>`,
    `<html lang="ru">`,
    `<head>`,
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${escapeHtml(SITE_TITLE)}</title>`,
    `<meta name="description" content="${escapeHtml(ir.ogDescription)}">`,
    `<meta name="robots" content="noindex">`,
    `<link rel="canonical" href="${storyUrl}">`,
    // Open Graph
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="Алхимия Женщины">`,
    `<meta property="og:url" content="${storyUrl}">`,
    `<meta property="og:title" content="${escapeHtml(ir.ogTitle)}">`,
    `<meta property="og:description" content="${escapeHtml(ir.ogDescription)}">`,
    `<meta property="og:image" content="${ogImage}">`,
  ];
  if (ir.heroImageDimensions) {
    lines.push(`<meta property="og:image:width" content="${ir.heroImageDimensions.width}">`);
    lines.push(`<meta property="og:image:height" content="${ir.heroImageDimensions.height}">`);
  }
  lines.push(
    `<meta property="og:image:alt" content="${escapeHtml(ir.heroAlt || ir.title)}">`,
    `<meta property="og:locale" content="ru_RU">`,
    // Twitter
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(ir.ogTitle)}">`,
    `<meta name="twitter:description" content="${escapeHtml(ir.ogDescription)}">`,
    `<meta name="twitter:image" content="${ogImage}">`,
    `<link rel="icon" type="image/svg+xml" href="/images/favicon.svg">`,
    `<link rel="preconnect" href="https://fonts.googleapis.com">`,
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
    `<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter+Tight:wght@400;500;600&family=PT+Serif:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet">`,
    `<style>${STYLES}</style>`,
    // Vercel Web Analytics — auto-served from the same domain when enabled
    // in the Vercel dashboard. Single tag, no npm dependency for static HTML.
    `<script defer src="/_vercel/insights/script.js"></script>`,
    `</head>`
  );
  return lines.join('\n');
}

const STYLES = `
  :root {
    --bg: #f3ece0;
    --paper: #faf6ee;
    --ink: #15110d;
    --ink-2: #1c1814;
    --ink-soft: rgba(21, 17, 13, 0.72);
    --ink-faint: rgba(28, 24, 20, 0.42);
    --ink-hair: rgba(28, 24, 20, 0.14);
    --gold: #9a7838;
    --serif: 'Cormorant Garamond', Georgia, serif;
    --serif-body: 'PT Serif', Georgia, Cambria, 'Times New Roman', serif;
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
  .story-page { max-width: 800px; margin: 0 auto; padding: 40px clamp(20px, 5vw, 56px) 96px; }
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
  .story-hero { width: 100%; margin: 36px 0 56px; border-radius: 8px; overflow: hidden; }
  .story-hero img { width: 100%; height: auto; display: block; aspect-ratio: 16 / 10; object-fit: cover; }
  .story-section { margin-bottom: 48px; }
  .story-section h2 {
    font-family: var(--serif);
    font-weight: 500;
    font-size: clamp(26px, 2.4vw, 32px);
    line-height: 1.25;
    color: var(--ink);
    margin: 54px 0 24px;
    letter-spacing: -0.005em;
    text-wrap: balance;
  }
  .story-section h2:first-child { margin-top: 0; }
  .story-section h3 {
    font-family: var(--serif);
    font-weight: 500;
    font-style: italic;
    font-size: clamp(26px, 2.15vw, 30px);
    line-height: 1.3;
    color: var(--ink);
    margin: 48px 0 18px;
    letter-spacing: -0.005em;
    text-wrap: balance;
    position: relative;
    padding-left: 22px;
  }
  .story-section h3::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0.5em;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--gold);
  }
  .story-section + .story-section h2 { padding-top: 54px; }
  .story-section p {
    font-family: var(--serif-body);
    font-weight: 400;
    font-size: clamp(18px, 1.35vw, 19px);
    line-height: 1.6;
    color: var(--ink-2);
    margin-bottom: 20px;
    text-wrap: pretty;
    hanging-punctuation: first last;
  }
  .story-section .story-quote {
    margin-block: 43px;
    margin-inline: 0;
    padding-block: clamp(27px, 3.4vw, 43px);
    padding-inline: 0;
    background: transparent;
    border-top: 1px solid rgba(154, 120, 56, 0.45);
    border-bottom: 1px solid rgba(154, 120, 56, 0.45);
    font-family: var(--serif-body);
    font-style: italic;
    font-weight: 400;
    font-size: clamp(20px, 1.65vw, 24px);
    line-height: 1.5;
    color: var(--ink);
  }
  .story-section .story-quote em { color: var(--gold); font-style: italic; }
  .story-section .story-finale {
    margin: 49px 0 18px;
    padding: clamp(31px, 3.85vw, 46px) 0;
    border-top: 1px solid rgba(154, 120, 56, 0.45);
    border-bottom: 1px solid rgba(154, 120, 56, 0.45);
    text-align: left;
  }
  .story-section .story-finale p {
    font-family: var(--serif-body);
    font-style: italic;
    font-weight: 400;
    font-size: clamp(19px, 1.55vw, 22px);
    line-height: 1.55;
    color: var(--ink);
    margin: 7px 0;
    text-wrap: pretty;
  }
  .story-section .story-finale p em { color: var(--gold); font-style: italic; }
  .story-section .story-figure-pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin: 41px 0;
  }
  .story-section .story-figure-pair figure { margin: 0; display: flex; flex-direction: column; }
  .story-section .story-figure-pair img { width: 100%; height: auto; display: block; border-radius: 8px; background: #0a0d10; }
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
    .story-section .story-figure-pair { grid-template-columns: 1fr; gap: 28px; }
  }
  .story-section .story-image { margin: 41px 0; border-radius: 8px; overflow: hidden; }
  .story-section .story-image img { width: 100%; height: auto; display: block; }
  .story-section ul.story-contrast {
    list-style: none;
    margin: 24px 0;
    padding: 20px 28px;
    background: var(--paper);
    border-radius: 12px;
    border-left: 2px solid var(--gold);
  }
  .story-section ul.story-contrast li {
    font-family: var(--serif-body);
    font-weight: 400;
    font-size: clamp(17px, 1.25vw, 18px);
    line-height: 1.55;
    color: var(--ink-2);
    padding: 8px 0;
    text-wrap: pretty;
  }
  .story-section ul.story-contrast li + li { border-top: 1px solid rgba(154, 120, 56, 0.15); }
  .story-cta-row { margin: 56px 0 0; text-align: center; }
  .story-cta {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    padding: 17px 26px 17px 28px;
    border-radius: 999px;
    font-family: var(--sans);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    background: var(--ink);
    color: var(--paper);
    border: 1px solid var(--ink);
    text-decoration: none;
    transition: transform .25s cubic-bezier(.2,.7,.2,1), background .25s, color .25s, border-color .25s;
    white-space: nowrap;
  }
  .story-cta:hover { background: var(--gold); border-color: var(--gold); transform: translateY(-1px); }
  .story-cta .arrow { display: inline-block; transition: transform .25s; }
  .story-cta:hover .arrow { transform: translateX(4px); }
  @media (max-width: 640px) {
    .story-page { padding: 30px 22px 72px; }
    .story-back { margin-bottom: 36px; }
    .story-title { font-size: clamp(28px, 8vw, 36px); }
    .story-hero img { aspect-ratio: 4 / 3; }
    .story-section p { font-size: 19px; line-height: 1.6; }
    .story-section h2 { font-size: 28px; }
    .story-section h3 { font-size: 26px; }
    .story-section .story-quote { font-size: 22px; line-height: 1.5; }
    .story-section .story-finale p { font-size: 21px; line-height: 1.55; }
    .story-section ul.story-contrast li { font-size: 18px; }
    .story-section .story-figure-pair figcaption { font-size: 17px; }
    .story-cta { white-space: normal; padding: 16px 24px; line-height: 1.35; max-width: 100%; }
  }
`;

function renderBlock(b) {
  if (b.type === 'p') {
    return `<p>${escapeHtml(b.text)}</p>`;
  }
  if (b.type === 'h3') {
    return `<h3>${escapeHtml(b.text)}</h3>`;
  }
  if (b.type === 'quote') {
    let html;
    if (b.goldFragment && b.text.includes(b.goldFragment)) {
      const idx = b.text.indexOf(b.goldFragment);
      const before = b.text.slice(0, idx);
      const after = b.text.slice(idx + b.goldFragment.length);
      html = `${escapeHtml(before)}<em>${escapeHtml(b.goldFragment)}</em>${escapeHtml(after)}`;
    } else {
      html = escapeHtml(b.text);
    }
    return `<blockquote class="story-quote">${html}</blockquote>`;
  }
  if (b.type === 'image') {
    return `<figure class="story-image"><img src="${b.src}" alt="${escapeHtml(b.alt || '')}" loading="lazy"></figure>`;
  }
  if (b.type === 'figure-pair') {
    const inner = b.items.map(it => {
      const cap = it.caption ? `    <figcaption>${escapeHtml(it.caption)}</figcaption>` : '';
      return `  <figure>\n    <img src="${it.src}" alt="" loading="lazy">\n${cap}\n  </figure>`;
    }).join('\n');
    return `<div class="story-figure-pair">\n${inner}\n</div>`;
  }
  if (b.type === 'finale') {
    const inner = b.lines.map(ln => {
      const t = escapeHtml(ln.text);
      return `  <p>${ln.gold ? `<em>${t}</em>` : t}</p>`;
    }).join('\n');
    return `<div class="story-finale">\n${inner}\n</div>`;
  }
  if (b.type === 'ul') {
    const inner = b.items.map(item => `  <li>${escapeHtml(item)}</li>`).join('\n');
    return `<ul class="story-contrast">\n${inner}\n</ul>`;
  }
  return '';
}

function renderStoryHtml(ir) {
  const out = [];
  out.push(renderHead(ir));
  out.push(`<body>`);
  out.push(`<main class="story-page">`);
  out.push(`<a class="story-back" href="${BACK_HREF}">${escapeHtml(BACK_TEXT)}</a>`);
  out.push(`<h1 class="story-title">${escapeHtml(ir.title)}</h1>`);
  out.push(`<div class="story-hero"><img src="${ir.heroImage}" alt="${escapeHtml(ir.heroAlt || '')}"></div>`);

  for (const section of ir.sections) {
    out.push(`<section class="story-section">`);
    if (section.heading) out.push(`<h2>${escapeHtml(section.heading)}</h2>`);
    for (const b of section.blocks) {
      const html = renderBlock(b);
      if (html) out.push(html);
    }
    out.push(`</section>`);
  }

  out.push(`<div class="story-cta-row">`);
  out.push(`  <a class="story-cta" href="${CTA_HREF}">${escapeHtml(CTA_TEXT)} <span class="arrow">→</span></a>`);
  out.push(`</div>`);
  out.push(`</main>`);
  out.push(`</body>`);
  out.push(`</html>`);

  return out.join('\n');
}

module.exports = { renderStoryHtml, escapeHtml };
