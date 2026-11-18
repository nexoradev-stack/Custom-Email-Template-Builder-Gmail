'use strict';

/**
 * Publish pipeline: turns the HTML/CSS a designer pastes into Gmail-ready HTML
 * and reports what is fine, what is risky and what blocks publishing.
 */

const juice = require('juice');
const cheerio = require('cheerio');
const cfg = require('./config');
const { findFont, backupName } = require('./fonts');

/* ---------- inline style helpers ---------- */

function parseStyle(style) {
  const out = [];
  let buf = '';
  let depth = 0;
  let quote = null;
  const push = () => {
    const i = buf.indexOf(':');
    if (i > 0) {
      const prop = buf.slice(0, i).trim().toLowerCase();
      const value = buf.slice(i + 1).replace(/\s*!important\s*$/i, '').trim();
      if (prop && value) out.push([prop, value]);
    }
    buf = '';
  };
  for (const ch of String(style || '')) {
    if (quote) {
      if (ch === quote) quote = null;
      buf += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
    } else if (ch === '(') {
      depth++;
      buf += ch;
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1);
      buf += ch;
    } else if (ch === ';' && depth === 0) {
      push();
    } else {
      buf += ch;
    }
  }
  push();
  return out;
}

const serializeStyle = (decls) => decls.map(([p, v]) => `${p}:${v}`).join(';');
const getDecl = (decls, prop) => {
  for (let i = decls.length - 1; i >= 0; i--) if (decls[i][0] === prop) return decls[i][1];
  return null;
};
const setDecl = (decls, prop, value) => {
  const kept = decls.filter(([p]) => p !== prop);
  kept.push([prop, value]);
  return kept;
};

/* ---------- image link classification ---------- */

const BLOCKED_HOSTS = [
  [/(^|\.)figma\.com$/, 'is a Figma link. Figma links are pages or expire, so the image will break.'],
  [/^figma-alpha-api\.s3[.-]/, 'is a temporary Figma export link that expires.'],
  [/^(drive|docs)\.google\.com$/, 'is a Google Drive link, which does not work as an email image.'],
  [/^photos\.(app\.goo\.gl|google\.com)$/, 'is a Google Photos page, not an image file.'],
  [/(^|\.)dropbox\.com$/, 'is a Dropbox share page, not an image file.'],
  [/^(onedrive\.live\.com|1drv\.ms)$/, 'is a OneDrive link that needs a sign-in.'],
  [/\.sharepoint\.com$/, 'is a SharePoint link that needs a sign-in.'],
  [/^files\.slack\.com$/, 'is a Slack file link that needs a sign-in.'],
  [/^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/,
    'points to a private computer or network that recipients cannot reach.'],
  [/^(via\.placeholder\.com|placehold\.co|placeholder\.com|placekitten\.com|picsum\.photos|dummyimage\.com|placehold\.it)$/,
    'is a placeholder image. Replace it with the real image.'],
  [/(^|\.)example\.(com|org|net)$/, 'is a made-up example link. Replace it with the real image.']
];

/**
 * @returns {{level:'ok'|'warn'|'error', reason:string}}
 */
function classifyImageUrl(raw) {
  const src = String(raw || '').trim();
  if (!src) return { level: 'error', reason: 'has no link.' };
  if (src.startsWith(cfg.libraryPrefix)) return { level: 'ok', reason: 'is in the image library.' };
  if (/^data:/i.test(src)) return { level: 'error', reason: 'is pasted inside the code (data:). Gmail will not show it.' };
  if (/^(blob|file|cid):/i.test(src)) return { level: 'error', reason: 'only exists on one computer, so recipients cannot load it.' };
  if (/^\/\//.test(src)) return { level: 'error', reason: 'has no https:// at the start.' };

  let url;
  try {
    url = new URL(src);
  } catch (e) {
    return { level: 'error', reason: 'is a file path on a computer, not a web link.' };
  }
  if (!/^https?:$/.test(url.protocol)) return { level: 'error', reason: 'is not a web link.' };

  const host = url.hostname.toLowerCase();
  for (const [pattern, reason] of BLOCKED_HOSTS) if (pattern.test(host)) return { level: 'error', reason };

  if (/[?&](X-Goog-Expires|X-Goog-Signature|X-Amz-Expires|X-Amz-Signature|Signature|Expires)=/i.test(url.search)) {
    return { level: 'error', reason: 'is a temporary link that will expire.' };
  }
  const path = url.pathname.toLowerCase();
  if (path.endsWith('.svg')) return { level: 'error', reason: 'is an SVG. Gmail and Outlook do not show SVG images.' };
  if (path.endsWith('.webp')) return { level: 'warn', reason: 'is a WebP image, which some email apps do not show. Use JPG or PNG.' };
  if (url.protocol === 'http:') return { level: 'warn', reason: 'uses http:// instead of https://, which some email apps block.' };
  return { level: 'warn', reason: 'is not in the image library. If that site removes it, the image disappears from emails.' };
}

/* ---------- main ---------- */

const shorten = (s, n = 70) => (s.length > n ? `${s.slice(0, n)}…` : s);
const kb = (bytes) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * @param {string} source HTML and CSS as pasted by the designer
 * @returns {{html:string, checks:Array<{level:string, code:string, message:string}>, hasErrors:boolean, bytes:number}}
 */
function processTemplate(source) {
  const checks = [];
  const add = (level, code, message) => checks.push({ level, code, message });
  const input = String(source || '');

  if (!input.trim()) {
    add('error', 'empty', 'There is no HTML to publish.');
    return { html: '', checks, hasErrors: true, bytes: 0 };
  }
  if (!/<\s*(table|div|p|td|tr|img|a|span|h[1-6]|body|html|br|center|section)\b/i.test(input)) {
    add('error', 'not_html', 'This is plain text, not HTML code. Copy the code itself (it starts with <!DOCTYPE html> or <table>), not the finished page.');
    return { html: '', checks, hasErrors: true, bytes: 0 };
  }
  if (Buffer.byteLength(input) > cfg.maxSourceBytes) {
    add('error', 'source_too_big', `The pasted code is over ${kb(cfg.maxSourceBytes)}. Remove embedded images or unused code.`);
    return { html: '', checks, hasErrors: true, bytes: 0 };
  }

  /* 1. Inline the CSS */
  const hadStyleBlock = /<style[\s>]/i.test(input);
  let inlined = input;
  try {
    inlined = juice(input, {
      removeStyleTags: true,
      preserveMediaQueries: false,
      preserveFontFaces: false,
      preserveKeyFrames: false,
      preservePseudos: false,
      applyWidthAttributes: false,
      applyHeightAttributes: false
    });
    add('ok', 'css_inlined', hadStyleBlock ? 'CSS moved inline.' : 'CSS is already inline.');
  } catch (e) {
    add('warn', 'css_inline_failed', 'Some CSS could not be read and was skipped. Check the preview carefully.');
  }
  if (/@media/i.test(input)) {
    add('warn', 'media_queries', 'Mobile rules (@media) are removed by Gmail. Widths were made fluid instead; check the preview on a phone.');
  }
  if (/@font-face|fonts\.googleapis\.com/i.test(input)) {
    add('warn', 'web_fonts', 'Downloadable fonts do not load in Gmail. Each font shows its backup instead (for example Arial).');
  }

  /* 2. Clean up what Gmail drops or what is unsafe */
  const $ = cheerio.load(inlined, { decodeEntities: false });
  const hadForm = $('form').length > 0;
  $('script, style, link, meta, title, head, noscript, iframe, object, embed, base').remove();
  $('*').contents().filter((i, n) => n.type === 'comment').remove();
  if (hadForm) add('warn', 'form', 'Forms do not work in email. Link to a web form instead.');

  const fontsUsed = new Map();
  let hiddenRemoved = 0;
  let usesFlexOrGrid = false;
  let usesPosition = false;

  $('body *').each((i, el) => {
    const node = $(el);
    const attribs = el.attribs || {};
    for (const name of Object.keys(attribs)) {
      if (/^on/i.test(name) || /^pardot-/i.test(name) || name === 'class' || name === 'id') node.removeAttr(name);
    }
    if (attribs.face) {
      const faceFont = findFont(attribs.face);
      node.attr('face', faceFont ? faceFont.stack.replace(/'/g, '') : 'Arial');
    }

    if (!attribs.style) return;
    let decls = parseStyle(attribs.style);

    const display = (getDecl(decls, 'display') || '').toLowerCase();
    if (display === 'none') {
      hiddenRemoved++;
      node.remove();
      return;
    }
    if (/flex|grid/.test(display)) usesFlexOrGrid = true;
    const position = (getDecl(decls, 'position') || '').toLowerCase();
    if (position === 'absolute' || position === 'fixed') usesPosition = true;

    /* 3. Fonts: keep the ones from our list (with their backups), anything else becomes Arial */
    if (getDecl(decls, 'font-family') !== null) {
      const font = findFont(getDecl(decls, 'font-family'));
      decls = setDecl(decls, 'font-family', font ? font.stack : cfg.fontStack);
      if (font) fontsUsed.set(font.name, font);
    }

    /* 4. Fixed widths become fluid */
    const width = /^(\d+(?:\.\d+)?)px$/i.exec(getDecl(decls, 'width') || '');
    if (width && Number(width[1]) >= 480 && el.tagName !== 'img') {
      decls = setDecl(decls, 'width', '100%');
      if (getDecl(decls, 'max-width') === null) decls = setDecl(decls, 'max-width', `${width[1]}px`);
    }
    node.attr('style', serializeStyle(decls));
  });

  $('body [width]').each((i, el) => {
    const node = $(el);
    const w = /^(\d+)(px)?$/i.exec(String(node.attr('width')).trim());
    if (!w || Number(w[1]) < 480) return;
    let decls = parseStyle(node.attr('style'));
    if (el.tagName === 'img') {
      decls = setDecl(setDecl(decls, 'max-width', '100%'), 'height', 'auto');
      node.removeAttr('height');
    } else {
      node.attr('width', '100%');
      if (getDecl(decls, 'max-width') === null) decls = setDecl(decls, 'max-width', `${w[1]}px`);
    }
    node.attr('style', serializeStyle(decls));
  });

  const named = [...fontsUsed.values()].filter((f) => f.name !== 'Arial' && f.name !== 'Helvetica');
  if (!named.length) {
    add('ok', 'font', 'Font set to Arial.');
  } else {
    add('ok', 'font', `Fonts: ${['Arial', ...named.map((f) => f.name)].join(', ')}.`);
    const web = named.filter((f) => f.web);
    if (web.length) {
      add('warn', 'font_backup', `${web.map((f) => `${f.name} shows only where it is installed; most people see ${backupName(f)}`).join('. ')}.`);
    }
  }
  if (hiddenRemoved) add('ok', 'hidden_removed', 'Hidden preview text was removed (Gmail compose does not keep it).');
  if (usesFlexOrGrid) add('warn', 'flex_grid', 'The layout uses flexbox or grid. Use tables so Outlook shows it correctly.');
  if (usesPosition) add('warn', 'position', 'Absolute positioning is not supported in most email apps.');

  /* 5. Images */
  const problems = { error: [], warn: [] };
  let imageCount = 0;
  let missingAlt = 0;
  $('body img').each((i, el) => {
    imageCount++;
    const node = $(el);
    const src = node.attr('src') || '';
    const verdict = classifyImageUrl(src);
    if (verdict.level !== 'ok') problems[verdict.level].push(`"${shorten(src || '(empty)')}" ${verdict.reason}`);
    if (node.attr('alt') === undefined) missingAlt++;
    if (!/border/i.test(node.attr('style') || '') && node.attr('border') === undefined) node.attr('border', '0');
  });
  $('body [background]').each((i, el) => {
    const src = $(el).attr('background') || '';
    const verdict = classifyImageUrl(src);
    if (verdict.level !== 'ok') problems[verdict.level].push(`Background "${shorten(src)}" ${verdict.reason}`);
  });
  $('body [style]').each((i, el) => {
    const m = /url\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec($(el).attr('style') || '');
    if (!m) return;
    const verdict = classifyImageUrl(m[1]);
    if (verdict.level !== 'ok') problems[verdict.level].push(`Background "${shorten(m[1])}" ${verdict.reason}`);
  });
  problems.error.forEach((m) => add('error', 'image_blocked', `Image ${m}`));
  problems.warn.forEach((m) => add('warn', 'image_outside', `Image ${m}`));
  if (imageCount && !problems.error.length && !problems.warn.length) add('ok', 'images', 'All images are from the image library.');
  if (missingAlt) add('warn', 'alt', `${missingAlt} image(s) have no alt text. Add alt="..." so something shows when images are blocked.`);

  /* 6. Links */
  let deadLinks = 0;
  let linkCount = 0;
  $('body a').each((i, el) => {
    const node = $(el);
    const href = (node.attr('href') || '').trim();
    if (/^javascript:/i.test(href)) node.attr('href', '#');
    if (!href || href === '#' || /^javascript:/i.test(href)) deadLinks++;
    else {
      linkCount++;
      if (!node.attr('target')) node.attr('target', '_blank');
    }
  });
  if (deadLinks) add('warn', 'dead_links', `${deadLinks} link(s) still point to "#". Add the real URL.`);
  /* Information only: how many links the template has (nothing is blocked). */
  add('info', 'link_count', linkCount === 0 ? 'This template has no links.' : `This template has ${linkCount} link${linkCount === 1 ? '' : 's'}.`);

  /* 7. Merge tags from Salesforce */
  const tags = ($('body').text().match(/\{\{[^}]+\}\}|%%[^%]+%%|\{![^}]+\}/g) || []);
  const hrefTags = [];
  $('body a').each((i, el) => {
    const m = /\{\{[^}]+\}\}|%%[^%]+%%/.exec($(el).attr('href') || '');
    if (m) hrefTags.push(m[0]);
  });
  const allTags = [...new Set([...tags, ...hrefTags])];
  if (allTags.length) {
    add('warn', 'merge_tags', `Salesforce merge tags will be sent as plain text: ${allTags.slice(0, 4).join(', ')}. Replace or remove them.`);
  }

  /* 8. Final HTML and size */
  const inner = ($('body').html() || '').trim();
  const html = `<div style="font-family:${cfg.fontStack}">${inner}</div>`;
  const bytes = Buffer.byteLength(html);
  if (!inner) add('error', 'empty', 'Nothing was left after cleaning the code. Check that you pasted the email body.');
  if (bytes > cfg.gmailClipBytes) {
    add('error', 'too_big', `Size ${kb(bytes)} is over Gmail's 102 KB limit. Gmail would cut the email off.`);
  } else if (bytes > cfg.gmailWarnBytes) {
    add('warn', 'nearly_too_big', `Size ${kb(bytes)} is close to Gmail's 102 KB limit.`);
  } else {
    add('ok', 'size', `Size ${kb(bytes)}, under Gmail's 102 KB limit.`);
  }

  const order = { error: 0, warn: 1, ok: 2, info: 3 };
  checks.sort((a, b) => order[a.level] - order[b.level]);
  return { html, checks, hasErrors: checks.some((c) => c.level === 'error'), bytes };
}

module.exports = { processTemplate, classifyImageUrl, parseStyle };
