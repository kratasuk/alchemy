// scripts/build-from-notion.cjs
//
// Fetches a story page from the Notion «Истории выпускниц» database,
// downloads its hero + inline images, builds the HTML using the shared
// renderer, and writes everything into the repo. Also updates the
// Notion row's Status → «Published» and fills the Story URL field.
//
// Usage:
//   NOTION_TOKEN=... NOTION_STORIES_DB_ID=... node scripts/build-from-notion.cjs <slug>
//   node scripts/build-from-notion.cjs --all-ready    # builds every Ready row
//   node scripts/build-from-notion.cjs --dry-run <slug>  # build but don't touch Notion
//
// Reads NOTION_TOKEN and NOTION_STORIES_DB_ID from process.env. Both must
// be set (you can put them in a local .env.local for testing — see
// docs/notion-stories-setup.md).

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { URL } = require('node:url');
const { renderStoryHtml } = require('./lib/render-story.cjs');

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_STORIES_DB_ID = process.env.NOTION_STORIES_DB_ID;
const NOTION_VERSION = '2022-06-28';
const SITE_ORIGIN = 'https://wmnalchemy.com';

const REPO_ROOT = path.join(__dirname, '..');
const STORIES_DIR = path.join(REPO_ROOT, 'stories');
const IMAGES_DIR = path.join(REPO_ROOT, 'images');

// ---------- HTTP helpers ----------

function fetchJson(url, { method = 'GET', body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      method,
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 400) {
          reject(new Error(`Notion ${method} ${url} → ${res.statusCode}: ${text.slice(0, 400)}`));
          return;
        }
        try { resolve(JSON.parse(text)); }
        catch (e) { reject(new Error(`Bad JSON from Notion: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'http:' ? require('node:http') : https;
    const req = lib.get(u, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, destPath).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Download ${url} → ${res.statusCode}`));
      }
      const out = fs.createWriteStream(destPath);
      res.pipe(out);
      out.on('finish', () => out.close(resolve));
      out.on('error', reject);
    });
    req.on('error', reject);
  });
}

// ---------- Notion block helpers ----------

function richTextToPlain(rich) {
  return (rich || []).map(r => r.plain_text || '').join('');
}

// Extract the first bold/italic span from rich_text as the gold-accent fragment.
function extractGoldFragment(rich) {
  if (!rich || !rich.length) return null;
  for (const r of rich) {
    if (r.annotations && (r.annotations.bold || r.annotations.italic)) {
      return r.plain_text || null;
    }
  }
  return null;
}

async function fetchAllChildren(blockId) {
  let cursor;
  const all = [];
  do {
    const url = `https://api.notion.com/v1/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`;
    const res = await fetchJson(url);
    all.push(...res.results);
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return all;
}

function notionImageUrl(block) {
  if (!block || block.type !== 'image') return null;
  const img = block.image;
  return img.type === 'external' ? img.external.url : img.file.url;
}

// Walk Notion blocks → our IR sections array
async function blocksToIR(blocks, slug) {
  const sections = [];
  let current = { heading: null, blocks: [] };
  const flush = () => {
    if (current.heading || current.blocks.length) sections.push(current);
    current = { heading: null, blocks: [] };
  };
  let imgIdx = 0;

  for (const b of blocks) {
    switch (b.type) {
      case 'heading_2': {
        flush();
        current.heading = richTextToPlain(b.heading_2.rich_text);
        break;
      }
      case 'heading_3': {
        current.blocks.push({ type: 'h3', text: richTextToPlain(b.heading_3.rich_text) });
        break;
      }
      case 'paragraph': {
        const txt = richTextToPlain(b.paragraph.rich_text).trim();
        if (txt) current.blocks.push({ type: 'p', text: txt });
        break;
      }
      case 'quote': {
        const rich = b.quote.rich_text;
        const text = richTextToPlain(rich);
        const goldFragment = extractGoldFragment(rich);
        current.blocks.push({ type: 'quote', text, goldFragment });
        break;
      }
      case 'bulleted_list_item':
      case 'numbered_list_item': {
        // Collect consecutive list items into one ul
        // (We handle this in a second pass — see below)
        current.blocks.push({ type: '_li_raw', text: richTextToPlain(b[b.type].rich_text) });
        break;
      }
      case 'image': {
        imgIdx++;
        const src = notionImageUrl(b);
        if (!src) break;
        const ext = guessImageExtension(src);
        const fname = `story-${slug}-inline-${imgIdx}${ext}`;
        const localPath = `/images/${fname}`;
        await downloadFile(src, path.join(IMAGES_DIR, fname));
        current.blocks.push({ type: 'image', src: localPath, alt: richTextToPlain(b.image.caption || []) });
        break;
      }
      case 'callout': {
        // Treat callouts whose icon-emoji or first line is `finale` as the finale block
        const firstLine = richTextToPlain(b.callout.rich_text).trim().toLowerCase();
        if (firstLine === 'finale' || (b.callout.icon && b.callout.icon.emoji === '✨')) {
          // Children are the lines
          const children = b.has_children ? await fetchAllChildren(b.id) : [];
          const finaleLines = children.filter(c => c.type === 'paragraph').map(c => {
            const rich = c.paragraph.rich_text;
            const isGold = rich.length && rich.every(r => r.annotations && (r.annotations.bold || r.annotations.italic));
            return { text: richTextToPlain(rich), gold: !!isGold };
          });
          current.blocks.push({ type: 'finale', lines: finaleLines });
        }
        break;
      }
      case 'toggle': {
        // Treat toggles whose summary is `figure-pair` as a figure-pair block
        const summary = richTextToPlain(b.toggle.rich_text).trim().toLowerCase();
        if (summary === 'figure-pair' && b.has_children) {
          const children = await fetchAllChildren(b.id);
          const items = [];
          let pendingImg = null;
          for (const c of children) {
            if (c.type === 'image') {
              imgIdx++;
              const src = notionImageUrl(c);
              if (!src) continue;
              const ext = guessImageExtension(src);
              const fname = `story-${slug}-pair-${imgIdx}${ext}`;
              const localPath = `/images/${fname}`;
              await downloadFile(src, path.join(IMAGES_DIR, fname));
              if (pendingImg) items.push(pendingImg);
              pendingImg = { src: localPath, caption: richTextToPlain(c.image.caption || []) };
            } else if (c.type === 'paragraph' && pendingImg) {
              // Caption follows image as paragraph
              if (!pendingImg.caption) pendingImg.caption = richTextToPlain(c.paragraph.rich_text);
            }
          }
          if (pendingImg) items.push(pendingImg);
          current.blocks.push({ type: 'figure-pair', items });
        }
        break;
      }
      default:
        // Ignore divider, table_of_contents, code, etc.
        break;
    }
  }
  flush();

  // Coalesce consecutive _li_raw into ul blocks
  for (const sec of sections) {
    const merged = [];
    let i = 0;
    while (i < sec.blocks.length) {
      if (sec.blocks[i].type === '_li_raw') {
        const items = [];
        while (i < sec.blocks.length && sec.blocks[i].type === '_li_raw') {
          items.push(sec.blocks[i].text);
          i++;
        }
        merged.push({ type: 'ul', items });
      } else {
        merged.push(sec.blocks[i]);
        i++;
      }
    }
    sec.blocks = merged;
  }

  return sections;
}

function guessImageExtension(url) {
  const m = url.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i);
  return m ? `.${m[1].toLowerCase()}` : '.jpg';
}

// Read width/height from a JPEG/PNG file header. Returns null on unsupported.
function getImageDimensions(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const head = Buffer.alloc(65536);
    const n = fs.readSync(fd, head, 0, 65536, 0);
    const buf = head.slice(0, n);
    // PNG: \x89 P N G \r \n \x1a \n   then 4-byte length + IHDR + width + height
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    // JPEG: FF D8 followed by markers; find an SOFn marker.
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        // SOF0..3, SOF5..7, SOF9..11, SOF13..15 carry dimensions.
        const isSOF = (marker >= 0xc0 && marker <= 0xcf) &&
          marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isSOF) {
          return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
        }
        // Skip the segment payload.
        const segLen = buf.readUInt16BE(i + 2);
        i += 2 + segLen;
      }
    }
    return null;
  } catch (e) {
    return null;
  } finally {
    if (fd) try { fs.closeSync(fd); } catch (e) {}
  }
}

// ---------- Property extraction ----------

function readProp(page, name) {
  const p = page.properties[name];
  if (!p) return null;
  switch (p.type) {
    case 'title': return richTextToPlain(p.title);
    case 'rich_text': return richTextToPlain(p.rich_text);
    case 'select': return p.select ? p.select.name : null;
    case 'url': return p.url;
    case 'date': return p.date ? p.date.start : null;
    case 'files': return p.files;
    default: return null;
  }
}

// ---------- Main pipeline ----------

async function buildOne(page, { dryRun }) {
  const slug = readProp(page, 'Slug');
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(`Page ${page.id}: invalid Slug «${slug}» — must be lowercase a-z, 0-9, dash only.`);
  }
  const title = readProp(page, 'Article title');
  const ogTitle = readProp(page, 'OG title') || title;
  const ogDescription = readProp(page, 'OG description') || '';
  const heroineName = readProp(page, 'Heroine name') || '';
  const heroFiles = readProp(page, 'Hero photo') || [];
  if (!heroFiles.length) throw new Error(`Page ${page.id} «${slug}»: Hero photo is empty.`);
  const heroUrl = heroFiles[0].type === 'external' ? heroFiles[0].external.url : heroFiles[0].file.url;
  const heroExt = guessImageExtension(heroUrl);
  const heroLocalName = `story-${slug}-hero${heroExt}`;
  const heroLocalPath = `/images/${heroLocalName}`;
  const heroFullPath = path.join(IMAGES_DIR, heroLocalName);
  await downloadFile(heroUrl, heroFullPath);
  const heroDims = getImageDimensions(heroFullPath);

  const blocks = await fetchAllChildren(page.id);
  const sections = await blocksToIR(blocks, slug);

  const ir = {
    slug,
    title,
    ogTitle,
    ogDescription,
    heroImage: heroLocalPath,
    heroImageDimensions: heroDims || undefined,
    heroAlt: heroineName ? `${heroineName}, выпускница Алхимии Женщины` : 'Выпускница Алхимии Женщины',
    sections,
  };

  const html = renderStoryHtml(ir);
  const outPath = path.join(STORIES_DIR, `${slug}.html`);
  fs.mkdirSync(STORIES_DIR, { recursive: true });
  fs.writeFileSync(outPath, html);
  console.log(`✓ Wrote ${path.relative(REPO_ROOT, outPath)} (${html.length} bytes)`);

  if (!dryRun) {
    const storyUrl = `${SITE_ORIGIN}/stories/${slug}.html`;
    await fetchJson(`https://api.notion.com/v1/pages/${page.id}`, {
      method: 'PATCH',
      body: {
        properties: {
          'Status': { select: { name: 'Published' } },
          'Published at': { date: { start: new Date().toISOString().slice(0, 10) } },
          'Story URL': { url: storyUrl },
        },
      },
    });
    console.log(`✓ Updated Notion page status → Published, URL → ${storyUrl}`);
  }
}

async function findPageBySlug(slug) {
  const res = await fetchJson(`https://api.notion.com/v1/databases/${NOTION_STORIES_DB_ID}/query`, {
    method: 'POST',
    body: { filter: { property: 'Slug', title: { equals: slug } }, page_size: 1 },
  });
  if (!res.results.length) throw new Error(`No Notion page found with Slug «${slug}»`);
  return res.results[0];
}

async function findAllReady() {
  const res = await fetchJson(`https://api.notion.com/v1/databases/${NOTION_STORIES_DB_ID}/query`, {
    method: 'POST',
    body: { filter: { property: 'Status', select: { equals: 'Ready to publish' } }, page_size: 50 },
  });
  return res.results;
}

async function main() {
  if (!NOTION_TOKEN) throw new Error('NOTION_TOKEN env var is missing.');
  if (!NOTION_STORIES_DB_ID) throw new Error('NOTION_STORIES_DB_ID env var is missing.');

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const all = args.includes('--all-ready');
  const slug = args.find(a => !a.startsWith('--'));

  if (all) {
    const pages = await findAllReady();
    if (!pages.length) { console.log('No pages with Status = «Ready to publish».'); return; }
    console.log(`Building ${pages.length} page(s)…`);
    for (const p of pages) await buildOne(p, { dryRun });
    return;
  }

  if (!slug) {
    console.error('Usage: node scripts/build-from-notion.cjs <slug>');
    console.error('       node scripts/build-from-notion.cjs --all-ready');
    console.error('       node scripts/build-from-notion.cjs --dry-run <slug>');
    process.exit(1);
  }

  const page = await findPageBySlug(slug);
  await buildOne(page, { dryRun });
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
