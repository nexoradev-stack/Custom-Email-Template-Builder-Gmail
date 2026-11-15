'use strict';

/**
 * Blocks: the parts of a template a user may change in the Customise window.
 *
 * Every image is an image block. Every element that holds text and no layout
 * (a table cell, paragraph, heading or div with only words, bold, links and
 * line breaks inside) is a text block. Blocks get stable ids in reading order
 * (i0, i1 ... for images, t0, t1 ... for text), so the same code always gives
 * the same ids and admin locks keep pointing at the right parts.
 *
 * Anything inside an element with data-lock (set by the block builder when an
 * admin switches off "Users can change this") is always locked.
 */

const cheerio = require('cheerio');

const TEXT_HOLDERS = 'td, th, p, div, h1, h2, h3, h4, h5, h6, li, blockquote';
const LAYOUT = 'table, tbody, thead, tfoot, tr, td, th, div, p, h1, h2, h3, h4, h5, h6, ul, ol, li, img, center, section, blockquote, hr';

const clip = (s, n = 48) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

/**
 * @param {string} html Gmail-ready HTML from the pipeline
 * @returns {{html:string, blocks:Array<{id:string,type:'image'|'text',label:string,locked:boolean}>}}
 */
function markBlocks(html) {
  const $ = cheerio.load(String(html || ''), { decodeEntities: false }, false);
  const blocks = [];

  $('img').each((i, el) => {
    const id = `i${i}`;
    $(el).attr('data-b', id);
    blocks.push({ id, type: 'image', label: clip($(el).attr('alt')) || `Image ${i + 1}`, locked: isLocked($, el) });
  });

  let n = 0;
  $(TEXT_HOLDERS).each((i, el) => {
    const node = $(el);
    if (node.find(LAYOUT).length) return;
    if (!node.text().trim()) return;
    if (node.parents('[data-b^="t"]').length) return;
    const id = `t${n++}`;
    node.attr('data-b', id);
    blocks.push({ id, type: 'text', label: clip(node.text()), locked: isLocked($, el) });
  });

  return { html: $.html(), blocks };
}

function isLocked($, el) {
  return $(el).is('[data-lock]') || $(el).parents('[data-lock]').length > 0;
}

/** All locked ids: the ones the admin ticked off plus the ones locked in the block builder. */
function allLocks(locks, blocks) {
  const set = new Set(cleanLocks(locks, blocks));
  (blocks || []).forEach((b) => { if (b.locked) set.add(b.id); });
  return [...set];
}

/** Removes block marks and editing leftovers before HTML goes into an email. */
function cleanForEmail(html) {
  const $ = cheerio.load(String(html || ''), { decodeEntities: false }, false);
  $('script, style, link, meta, iframe, object, embed, form, base').remove();
  $('*').each((i, el) => {
    for (const name of Object.keys(el.attribs || {})) {
      if (/^on/i.test(name) || name === 'contenteditable' || name === 'spellcheck' || name === 'class' || name === 'id' || /^data-/i.test(name)) {
        $(el).removeAttr(name);
      }
    }
  });
  $('a[href]').each((i, el) => {
    if (/^\s*javascript:/i.test($(el).attr('href'))) $(el).attr('href', '#');
  });
  return $.html();
}

/** Keeps only lock ids that exist in this template. */
function cleanLocks(locks, blocks) {
  const ids = new Set((blocks || []).map((b) => b.id));
  return [...new Set((Array.isArray(locks) ? locks : []).map(String))].filter((id) => ids.has(id)).slice(0, 500);
}

module.exports = { markBlocks, cleanForEmail, cleanLocks, allLocks };
