/*
 * __APP__ — "Build with blocks" editor (runs in the admin's browser).
 *
 * The template is a list of rows (header, image, text, button, image + text,
 * two columns, divider, space, footer). Each row has content, settings and a
 * "Users can change this" switch. The rows are turned into Gmail-safe table
 * HTML, which is what gets saved, checked and published.
 *
 * Talks to the page through window.ED (set up by the editor page script).
 */
(function () {
  'use strict';
  var ED = window.ED;
  var $ = function (id) { return document.getElementById(id); };
  var FONT = 'Arial, Helvetica, sans-serif';
  var FONTS = (ED.fonts && ED.fonts.length) ? ED.fonts : [{ name: 'Arial', stack: FONT, web: false, backup: 'Arial' }];
  var LIB = ED.libraryPrefix || '';
  function fontOf(name) { for (var i = 0; i < FONTS.length; i++) if (FONTS[i].name === name) return FONTS[i]; return FONTS[0]; }
  function fontStack(name) { return fontOf(name || 'Arial').stack; }

  /* ---------- row types ---------- */

  var TYPES = {
    header: { name: 'Header', make: function () { return { open: false, c: { src: '', alt: '__BRAND_JS__', text: '__BRAND_JS__', link: '' }, s: { style: 'text', bg: '#FFFFFF', color: '__INK__', size: 22, align: 'left', pt: 20, pb: 20, px: 24, shape: 'banner' } }; } },
    image: { name: 'Image', make: function () { return { open: true, c: { src: '', alt: '', link: '' }, s: { width: 'full', shape: 'wide', align: 'center', bg: '#FFFFFF', pt: 0, pb: 0, px: 0 } }; } },
    text: { name: 'Text', make: function () { return { open: true, c: { html: 'Write your message here. Click this text in the email to type.' }, s: { size: 14, color: '#1F1F1F', bg: '#FFFFFF', lh: 'normal', align: 'left', weight: 'normal', pt: 20, pb: 0, px: 24 } }; } },
    button: { name: 'Button', make: function () { return { open: true, c: { label: 'Learn more', url: '__SITE_JS__/' }, s: { bgc: '__ACCENT__', color: '#FFFFFF', size: 15, radius: 6, align: 'left', bg: '#FFFFFF', pt: 20, pb: 24, px: 24 } }; } },
    imageText: { name: 'Image + text', make: function () { return { open: true, c: { src: '', alt: '', html: 'A short note next to the image. Click to type.' }, s: { side: 'left', iw: 200, shape: 'square', size: 14, color: '#1F1F1F', lh: 'normal', bg: '#FFFFFF', pt: 20, pb: 20, px: 24 } }; } },
    cols: { name: 'Columns', make: function () { return { open: true, c: { cols: [{ kind: 'text', html: 'Column text. Click to type.' }, { kind: 'text', html: 'Column text. Click to type.' }] }, s: { layout: '1:1', gap: 20, valign: 'top', shape: 'photo', size: 14, color: '#1F1F1F', lh: 'normal', bgc: '__ACCENT__', btncolor: '#FFFFFF', bg: '#FFFFFF', pt: 20, pb: 20, px: 24 } }; } },
    twoCols: { name: 'Two columns', make: function () { return { open: true, c: { left: 'Left column text.', right: 'Right column text.' }, s: { size: 14, color: '#1F1F1F', lh: 'normal', bg: '#FFFFFF', pt: 20, pb: 20, px: 24 } }; } },
    divider: { name: 'Divider', make: function () { return { open: false, c: {}, s: { color: '#DADCE0', thick: 1, bg: '#FFFFFF', pt: 16, pb: 16, px: 24 } }; } },
    space: { name: 'Space', make: function () { return { open: false, c: {}, s: { h: 24, bg: '#FFFFFF' } }; } },
    footer: { name: 'Footer', make: function () { return { open: false, c: { html: '© __BRAND_JS__. All rights reserved.' }, s: { size: 12, color: '__INK__', bg: '__SOFT__', lh: 'normal', align: 'center', pt: 20, pb: 20, px: 24 } }; } }
  };
  var ORDER = ['header', 'image', 'text', 'button', 'imageText', 'cols', 'divider', 'space', 'footer'];
  var LAYOUTS = { '1:1': [50, 50], '1:2': [33, 67], '2:1': [67, 33], '1:1:1': [33, 34, 33] };

  var LH = { tight: 1.3, normal: 1.6, loose: 1.9 };
  /* Height shapes: [key, label, height ÷ width] */
  var HSHAPES = [['auto', 'Auto', 0], ['1:1', '1:1', 1], ['3:4', '3:4', 4 / 3], ['4:5', '4:5', 1.25], ['16:9', '16:9', 9 / 16], ['2:1', '2:1', 0.5], ['3:1', '3:1', 1 / 3]];
  var WIDTHS = [520, 600, 640, 700];

  var uid = 0;
  function newId() { uid++; return 'r' + Date.now().toString(36) + uid; }

  function makeRow(type) {
    var r = TYPES[type].make();
    r.id = newId();
    r.type = type;
    return r;
  }

  function starter() {
    var rows = [makeRow('header'), makeRow('image'), makeRow('text'), makeRow('button'), makeRow('footer')];
    rows[2].c.html = 'Hi there,<br><br>Write your message here. Click this text in the email to type.';
    return { v: 1, width: 600, page: '#F1F3F4', bg: '#FFFFFF', rows: rows };
  }

  /* ---------- HTML output (Gmail-safe tables, inline styles) ---------- */

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function px(n) { return Math.max(0, Math.round(Number(n) || 0)); }
  function color(c, fallback) { return /^#[0-9a-fA-F]{3,8}$/.test(String(c || '')) ? c : fallback; }
  function lh(r) { return Math.round((Number(r.s.size) || 14) * (LH[r.s.lh] || 1.6)); }
  function textStyle(r) {
    return 'font-family:' + fontStack(r.s.font) + ';font-size:' + px(r.s.size || 14) + 'px;line-height:' + lh(r) + 'px;color:' + color(r.s.color, '#1F1F1F') + ';' +
      (r.s.weight === 'bold' ? 'font-weight:bold;' : '');
  }
  function emailW() { return Math.min(800, Math.max(480, Math.round(Number(model && model.width) || 600))); }
  function innerWidth(r) { return emailW() - 2 * px(r.s.px); }
  function imageWidth(r) { return r.s.width === 'full' ? innerWidth(r) : Math.min(innerWidth(r), Number(r.s.width) || 300); }
  function sideImageWidth(r) { return Math.min(280, Math.max(80, px(r.s.iw) || 200)); }
  function colWidths(r) {
    var pcts = LAYOUTS[r.s.layout] || LAYOUTS['1:1'];
    var gap = px(r.s.gap);
    var total = innerWidth(r) - gap * (pcts.length - 1);
    return pcts.map(function (p) { return Math.floor(total * p / 100); });
  }

  /* Every image in a row, with the width it is shown at. */
  function imagesOf(r) {
    if (r.type === 'image') return [{ t: r.c, w: function () { return imageWidth(r); } }];
    if (r.type === 'header' && r.s.style === 'image') return [{ t: r.c, w: function () { return innerWidth(r); } }];
    if (r.type === 'imageText') return [{ t: r.c, w: function () { return sideImageWidth(r); } }];
    if (r.type === 'cols') {
      var list = [];
      (r.c.cols || []).forEach(function (col, i) {
        if (col.kind === 'image') list.push({ t: col, w: function () { return colWidths(r)[i] || 200; } });
      });
      return list;
    }
    return [];
  }

  function imgTag(src, alt, w, editor, block, align, h) {
    if (!src) {
      if (!editor) return '<img src="" alt="' + esc(alt) + '" width="' + w + '">';
      return '<div style="height:' + (h || Math.round(w / 2.4)) + 'px;max-width:' + w + 'px;margin:' + (align === 'center' ? '0 auto' : '0') + ';background:#E8EAED;border:2px dashed __ACCENT_LIGHT__;border-radius:6px;display:flex;align-items:center;justify-content:center;font:13px ' + FONT + ';color:#5F6368">Choose an image on the right</div>';
    }
    var disp = block ? 'display:block;' : 'display:inline-block;';
    return '<img src="' + esc(src) + '" alt="' + esc(alt) + '" width="' + w + '" style="' + disp + 'width:100%;max-width:' + w + 'px;height:auto;border:0;">';
  }

  function linkWrap(html, url) {
    return url ? '<a href="' + esc(url) + '" target="_blank" style="text-decoration:none;">' + html + '</a>' : html;
  }

  function content(r, editor) {
    var f = function (name) { return editor ? ' data-field="' + name + '"' : ''; };
    var w;
    switch (r.type) {
      case 'header':
        if (r.s.style === 'image') {
          w = innerWidth(r);
          return linkWrap(imgTag(r.c.src, r.c.alt || '__BRAND_JS__', w, editor, true, 'left', r.c.h), r.c.link);
        }
        return '<div' + f('text') + ' style="font-family:' + fontStack(r.s.font) + ';font-size:' + px(r.s.size || 22) + 'px;line-height:' + Math.round(px(r.s.size || 22) * 1.25) + 'px;font-weight:bold;color:' + color(r.s.color, '__INK__') + ';">' + (r.c.text || '') + '</div>';
      case 'image':
        w = imageWidth(r);
        return linkWrap(imgTag(r.c.src, r.c.alt, w, editor, r.s.width === 'full', r.s.align, r.c.h), r.c.link);
      case 'text':
        return '<div' + f('html') + ' style="' + textStyle(r) + '">' + (r.c.html || '') + '</div>';
      case 'button':
        var a = r.s.align === 'center' ? 'center' : r.s.align === 'right' ? 'right' : 'left';
        return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="' + a + '" style="' + (a === 'center' ? 'margin:0 auto;' : '') + '"><tr><td style="background:' + color(r.s.bgc, '__ACCENT__') + ';border-radius:' + px(r.s.radius) + 'px;">' +
          '<a href="' + esc(r.c.url || '#') + '" target="_blank" style="display:inline-block;padding:12px 28px;font-family:' + fontStack(r.s.font) + ';font-size:' + px(r.s.size || 15) + 'px;font-weight:bold;line-height:20px;color:' + color(r.s.color, '#FFFFFF') + ';text-decoration:none;border-radius:' + px(r.s.radius) + 'px;">' + esc(r.c.label || 'Button') + '</a></td></tr></table>';
      case 'imageText':
        var iw = sideImageWidth(r);
        var img = '<td width="' + iw + '" valign="top" style="width:' + iw + 'px;">' + imgTag(r.c.src, r.c.alt, iw, editor, true, 'left', r.c.h) + '</td>';
        var txt = '<td valign="top" style="' + (r.s.side === 'right' ? 'padding-right:20px;' : 'padding-left:20px;') + '"><div' + f('html') + ' style="' + textStyle(r) + '">' + (r.c.html || '') + '</div></td>';
        return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' + (r.s.side === 'right' ? txt + img : img + txt) + '</tr></table>';
      case 'twoCols':
        return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
          '<td width="50%" valign="top" style="width:50%;padding-right:10px;"><div' + f('left') + ' style="' + textStyle(r) + '">' + (r.c.left || '') + '</div></td>' +
          '<td width="50%" valign="top" style="width:50%;padding-left:10px;"><div' + f('right') + ' style="' + textStyle(r) + '">' + (r.c.right || '') + '</div></td></tr></table>';
      case 'cols':
        var pcts = LAYOUTS[r.s.layout] || LAYOUTS['1:1'];
        var gap = px(r.s.gap);
        var total = innerWidth(r) - gap * (pcts.length - 1);
        var cells = pcts.map(function (pct, i) {
          var col = (r.c.cols && r.c.cols[i]) || { kind: 'text', html: '' };
          var cw = Math.floor(total * pct / 100);
          var pad = i === 0 ? '' : 'padding-left:' + gap + 'px;';
          var inner;
          if (col.kind === 'image') inner = linkWrap(imgTag(col.src, col.alt, cw, editor, true, 'left', col.h), col.link);
          else if (col.kind === 'button') {
            inner = '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:' + color(r.s.bgc, '__ACCENT__') + ';border-radius:6px;">' +
              '<a href="' + esc(col.url || '#') + '" target="_blank" style="display:inline-block;padding:11px 22px;font-family:' + fontStack(r.s.font) + ';font-size:' + px(r.s.size || 14) + 'px;font-weight:bold;line-height:20px;color:' + color(r.s.btncolor, '#FFFFFF') + ';text-decoration:none;border-radius:6px;">' + esc(col.label || 'Button') + '</a></td></tr></table>';
          } else inner = '<div' + f('col' + i) + ' style="' + textStyle(r) + '">' + (col.html || '') + '</div>';
          return '<td width="' + (cw + (i === 0 ? 0 : gap)) + '" valign="' + (r.s.valign === 'middle' ? 'middle' : 'top') + '" style="width:' + pct + '%;' + pad + '">' + inner + '</td>';
        }).join('');
        return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' + cells + '</tr></table>';
      case 'divider':
        return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:' + Math.max(1, px(r.s.thick)) + 'px solid ' + color(r.s.color, '#DADCE0') + ';font-size:1px;line-height:1px;">&nbsp;</td></tr></table>';
      case 'footer':
        return '<div' + f('html') + ' style="' + textStyle(r) + '">' + (r.c.html || '') + '</div>';
      default:
        return '';
    }
  }

  /* Editor only: the grip used to drag a row up or down. Never part of the saved email. */
  function handle(r) {
    return '<span class="dh" data-handle="' + r.id + '" contenteditable="false" title="Drag to move this row" aria-hidden="true">⠿</span>';
  }

  function rowHtml(r, editor) {
    var attrs = '';
    if (editor) attrs += ' data-row="' + r.id + '"' + (r.open ? '' : ' data-ui-lock="1"');
    if (!r.open) attrs += ' data-lock="1"';
    var bg = color(r.s.bg, '#FFFFFF');
    if (r.type === 'space') {
      return '<tr><td' + attrs + ' style="background:' + bg + ';height:' + px(r.s.h || 24) + 'px;font-size:1px;line-height:1px;">' + (editor ? handle(r) : '') + '&nbsp;</td></tr>';
    }
    var align = r.s.align === 'center' ? 'center' : r.s.align === 'right' ? 'right' : 'left';
    return '<tr><td' + attrs + ' align="' + align + '" style="background:' + bg + ';padding:' + px(r.s.pt) + 'px ' + px(r.s.px) + 'px ' + px(r.s.pb) + 'px ' + px(r.s.px) + 'px;text-align:' + align + ';">' +
      (editor ? handle(r) : '') + content(r, editor) + '</td></tr>';
  }

  function toHtml(model, editor) {
    var rows = model.rows.map(function (r) { return rowHtml(r, editor); }).join('\n');
    var page = color(model.page, '#F1F3F4');
    var bg = color(model.bg, '#FFFFFF');
    return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>' + esc(ED.name() || 'Email') + '</title>\n</head>\n<body style="margin:0;background:' + page + ';">\n' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + page + ';"><tr><td align="center" style="padding:24px 0;">\n' +
      '<table role="presentation" width="' + emailW() + '" cellpadding="0" cellspacing="0" border="0" align="center" style="' + (editor ? 'width:100%;max-width:' + emailW() + 'px;' : 'width:' + emailW() + 'px;') + 'background:' + bg + ';">\n' + rows + '\n</table>\n' +
      '</td></tr></table>\n</body>\n</html>';
  }

  /* ---------- safe inline text (what typing in the email may produce) ---------- */

  function sanitize(html) {
    var doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
    var out = '';
    function walk(node) {
      node.childNodes.forEach(function (n) {
        if (n.nodeType === 3) { out += esc(n.nodeValue).replace(/ /g, '&nbsp;'); return; }
        if (n.nodeType !== 1) return;
        var tag = n.tagName.toLowerCase();
        if (tag === 'br') { out += '<br>'; return; }
        if (tag === 'div' || tag === 'p') { if (out && !/<br>$/.test(out)) out += '<br>'; walk(n); return; }
        if (tag === 'b' || tag === 'strong') { out += '<b>'; walk(n); out += '</b>'; return; }
        if (tag === 'i' || tag === 'em') { out += '<i>'; walk(n); out += '</i>'; return; }
        if (tag === 'u') { out += '<u>'; walk(n); out += '</u>'; return; }
        if (tag === 'a') {
          var href = n.getAttribute('href') || '';
          var bold = n.getAttribute('data-s') === 'bold' || /font-weight\s*:\s*(bold|[6-9]00)/i.test(n.getAttribute('style') || '');
          if (/^(https?:|mailto:)/i.test(href)) { out += '<a href="' + esc(href) + '" target="_blank" style="color:__ACCENT__;text-decoration:none;' + (bold ? 'font-weight:bold;' : '') + '">'; walk(n); out += '</a>'; return; }
        }
        walk(n);
      });
    }
    walk(doc.body.firstChild);
    return out;
  }

  /* ---------- state ---------- */

  var model = null;
  var active = false;
  var selected = null;
  var frame = $('bframe');
  var panel = $('bpanel');
  var checkTimer = null;
  var checkSeq = 0;
  var previewMode = false;
  var lastClean = '';

  function row(id) { for (var i = 0; i < model.rows.length; i++) if (model.rows[i].id === id) return model.rows[i]; return null; }
  function rowIndex(id) { for (var i = 0; i < model.rows.length; i++) if (model.rows[i].id === id) return i; return -1; }

  var CANVAS_CSS = 'html,body{margin:0}' +
    '[data-row]{cursor:pointer;outline:2px dashed transparent;outline-offset:-2px;position:relative}' +
    '[data-row]:hover{outline-color:__ACCENT_LIGHT__}' +
    '[data-row].sel{outline:2px solid __ACCENT__}' +
    '[data-ui-lock]::after{content:"Locked for users";position:absolute;top:4px;right:4px;background:#5F6368;color:#fff;font:600 10px Arial,sans-serif;padding:2px 6px;border-radius:5px;pointer-events:none}' +
    '[data-field][contenteditable="true"]{outline:none;cursor:text;caret-color:__ACCENT__}' +
    '.dh{display:none;position:absolute;top:4px;left:4px;z-index:3;width:22px;height:22px;border-radius:6px;background:__ACCENT__;color:#fff;font:14px/22px Arial,sans-serif;text-align:center;cursor:grab;user-select:none;-webkit-user-select:none}' +
    '[data-row]:hover > .dh,[data-row].sel > .dh{display:block}' +
    '.dropline{position:absolute;left:0;right:0;height:4px;background:__ACCENT__;border-radius:2px;box-shadow:0 0 0 2px rgba(__ACCENT_RGB__,.25);pointer-events:none;z-index:9}' +
    'body.dragging,body.dragging *{cursor:grabbing !important;user-select:none !important}' +
    '[data-row].dragged{opacity:.35}';

  function render() {
    if (previewMode) { renderPreview(); return; }
    var y = 0;
    try { y = frame.contentWindow.scrollY; } catch (e) { y = 0; }
    frame.dataset.y = String(y);
    var html = toHtml(model, true).replace('</head>', '<style>' + CANVAS_CSS + '</style></head>');
    frame.srcdoc = html;
  }

  function renderPreview() {
    frame.srcdoc = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0}</style></head><body>' + lastClean + '</body></html>';
  }

  frame.addEventListener('load', function () {
    var doc = frame.contentDocument;
    if (!doc || !active) return;
    if (previewMode) {
      doc.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a'); if (a) e.preventDefault(); }, true);
      return;
    }
    try { frame.contentWindow.scrollTo(0, Number(frame.dataset.y) || 0); } catch (e) { /* ignore */ }
    doc.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a');
      if (a) e.preventDefault();
      var el = e.target.closest && e.target.closest('[data-row]');
      if (!el) { select(null); return; }
      var id = el.getAttribute('data-row');
      if (id !== selected) select(id, true);
    }, true);
    /* Nothing can be dragged around inside the email: a picture dropped into text would break the layout. */
    doc.addEventListener('dragstart', function (e) { e.preventDefault(); }, true);
    doc.addEventListener('drop', function (e) { e.preventDefault(); }, true);
    doc.addEventListener('mousedown', function (e) {
      var h = e.target.closest && e.target.closest('[data-handle]');
      if (!h) return;
      e.preventDefault();
      e.stopPropagation();
      startDrag(doc, h.getAttribute('data-handle'), e);
    }, true);
    doc.addEventListener('input', function (e) {
      var fieldEl = e.target.closest && e.target.closest('[data-field]');
      if (!fieldEl) return;
      readFields();
      ED.changed();
      queueCheck();
      commitSoon('Typing');
      /* If anything other than words, bold, italic, underline, links or line breaks got in, redraw from the clean text. */
      if (fieldEl.querySelector('img, table, div, p, span[style], font, iframe, video, svg, h1, h2, h3, ul, ol')) render();
    });
    doc.addEventListener('selectionchange', rememberSelection);
    doc.addEventListener('keyup', rememberSelection);
    doc.addEventListener('mouseup', rememberSelection);
    doc.addEventListener('keydown', function (e) {
      if (undoKeys(e)) return;
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K') && e.target.closest && e.target.closest('[data-field]')) {
        e.preventDefault();
        rememberSelection();
        var input = panel.querySelector('.linkrow input');
        if (input) input.focus();
        return;
      }
      if (e.key === 'Enter' && e.target.closest && e.target.closest('[data-field]')) {
        e.preventDefault();
        doc.execCommand('insertLineBreak');
      }
    });
    doc.addEventListener('paste', function (e) {
      if (!e.target.closest || !e.target.closest('[data-field]')) return;
      e.preventDefault();
      doc.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
    });
    markSelected();
  });

  function readFields() {
    var r = row(selected);
    var doc = frame.contentDocument;
    if (!r || !doc) return;
    doc.querySelectorAll('[data-row="' + r.id + '"] [data-field]').forEach(function (el) {
      var k = el.getAttribute('data-field');
      var clean = sanitize(el.innerHTML);
      if (k === 'text') r.c.text = clean;
      else if (/^col[0-9]$/.test(k) && r.c.cols) { var ci = Number(k.slice(3)); if (r.c.cols[ci]) r.c.cols[ci].html = clean; }
      else r.c[k] = clean;
    });
  }

  function markSelected() {
    var doc = frame.contentDocument;
    if (!doc) return;
    doc.querySelectorAll('[data-row]').forEach(function (el) {
      var on = el.getAttribute('data-row') === selected;
      el.classList.toggle('sel', on);
      el.querySelectorAll('[data-field]').forEach(function (f) {
        if (on) { f.setAttribute('contenteditable', 'true'); f.setAttribute('spellcheck', 'true'); }
        else { f.removeAttribute('contenteditable'); f.removeAttribute('spellcheck'); }
      });
    });
  }

  function select(id, fromCanvas) {
    if (selected) readFields();
    if (id !== selected) lastRange = null;
    selected = id;
    markSelected();
    renderPanel();
    if (!fromCanvas && id) {
      var el = frame.contentDocument && frame.contentDocument.querySelector('[data-row="' + id + '"]');
      if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function changed(label) { render(); ED.changed(); queueCheck(); commit(label || nextLabel || 'Change'); nextLabel = null; }

  /* ---------- undo and redo ---------- */

  var nextLabel = null;
  var past = [];
  var future = [];
  var current = null;
  var typingTimer = null;

  function snapshot(label) { return { json: JSON.stringify(model), selected: selected, label: label || '' }; }

  function commit(label) {
    clearTimeout(typingTimer);
    typingTimer = null;
    if (!model) return;
    var s = snapshot(label);
    if (current && s.json === current.json) { current.selected = selected; return; }
    if (current) { past.push(current); if (past.length > 50) past.shift(); }
    current = s;
    future = [];
    urButtons();
  }

  function commitSoon(label) {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(function () { commit(label); }, 700);
    urButtons();
  }

  function flushTyping() { if (typingTimer) { readFields(); commit('Typing'); } }

  function restoreState(state) {
    model = JSON.parse(state.json);
    selected = state.selected && row(state.selected) ? state.selected : null;
    render(); renderPanel(); ED.changed(); queueCheck();
    urButtons();
  }

  function undo() {
    flushTyping();
    if (!past.length) return;
    var label = current.label || 'Change';
    future.push(current);
    current = past.pop();
    restoreState(current);
    ED.toast('Undone: ' + label);
  }

  function redo() {
    flushTyping();
    if (!future.length) return;
    past.push(current);
    current = future.pop();
    restoreState(current);
    ED.toast('Redone: ' + (current.label || 'Change'));
  }

  function urButtons() {
    var u = $('bUndo');
    var r = $('bRedo');
    if (!u) return;
    u.disabled = !past.length && !typingTimer;
    r.disabled = !future.length;
    u.title = (past.length || typingTimer) ? 'Undo: ' + (typingTimer ? 'Typing' : (current && current.label) || 'Change') + ' (Cmd + Z)' : 'Nothing to undo';
    r.title = future.length ? 'Redo: ' + (future[future.length - 1].label || 'Change') + ' (Cmd + Shift + Z)' : 'Nothing to redo';
  }

  function undoKeys(e) {
    if (!(e.metaKey || e.ctrlKey) || (e.key !== 'z' && e.key !== 'Z')) return false;
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
    return true;
  }

  $('bUndo').addEventListener('click', undo);
  $('bRedo').addEventListener('click', redo);
  document.addEventListener('keydown', function (e) {
    if (!active || $('blocksView').hidden) return;
    var a = document.activeElement;
    if (a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return;
    undoKeys(e);
  }, true);

  /* ---------- drag a row up or down ---------- */

  function startDrag(doc, id, e0) {
    if (selected) readFields();
    var rowsEls = [].slice.call(doc.querySelectorAll('[data-row]'));
    var from = rowIndex(id);
    var dragged = doc.querySelector('[data-row="' + id + '"]');
    if (!dragged || from < 0) return;
    dragged.classList.add('dragged');
    doc.body.classList.add('dragging');
    var line = doc.createElement('div');
    line.className = 'dropline';
    doc.body.appendChild(line);
    var target = from;

    function place(y) {
      var win = doc.defaultView;
      var idx = rowsEls.length;
      for (var i = 0; i < rowsEls.length; i++) {
        var r = rowsEls[i].getBoundingClientRect();
        if (y < r.top + r.height / 2) { idx = i; break; }
      }
      target = idx;
      var ref = idx < rowsEls.length ? rowsEls[idx].getBoundingClientRect().top : rowsEls[rowsEls.length - 1].getBoundingClientRect().bottom;
      var box = rowsEls[0].getBoundingClientRect();
      line.style.top = (ref + win.scrollY - 2) + 'px';
      line.style.left = (box.left + win.scrollX) + 'px';
      line.style.width = box.width + 'px';
      line.style.right = 'auto';
    }
    function onMove(e) { e.preventDefault(); place(e.clientY); }
    function onUp() {
      doc.removeEventListener('mousemove', onMove, true);
      doc.removeEventListener('mouseup', onUp, true);
      line.remove();
      dragged.classList.remove('dragged');
      doc.body.classList.remove('dragging');
      var to = target > from ? target - 1 : target;
      if (to === from) return;
      var moved = model.rows.splice(from, 1)[0];
      model.rows.splice(to, 0, moved);
      selected = moved.id;
      changed('Drag row');
      renderPanel();
    }
    doc.addEventListener('mousemove', onMove, true);
    doc.addEventListener('mouseup', onUp, true);
    place(e0.clientY);
  }

  function queueCheck() {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(runCheck, 800);
  }

  function runCheck() {
    var mine = ++checkSeq;
    $('bstate').textContent = '· checking…';
    ED.post('/editor/check', { sourceHtml: toHtml(model, false) }).then(function (r) {
      if (mine !== checkSeq) return;
      $('bstate').textContent = '';
      lastClean = r.html || '';
      if (previewMode) renderPreview();
      showChecks(r.checks);
    }).catch(function () { if (mine === checkSeq) $('bstate').textContent = ''; });
  }

  function showChecks(checks) {
    var box = $('bchecks');
    box.innerHTML = '';
    var errors = (checks || []).filter(function (c) { return c.level !== 'ok'; });
    var title = document.createElement('div');
    title.className = 'bh';
    title.textContent = errors.length ? 'GMAIL CHECK · ' + errors.length + ' to look at' : 'GMAIL CHECK · all good';
    box.appendChild(title);
    (checks || []).forEach(function (c) {
      var d = document.createElement('div');
      d.className = 'c-' + c.level;
      var b = document.createElement('b');
      b.textContent = c.level === 'error' ? 'Fix: ' : c.level === 'warn' ? 'Check: ' : '✓ ';
      d.appendChild(b);
      d.appendChild(document.createTextNode(c.message));
      box.appendChild(d);
    });
  }

  /* ---------- bold, italic, underline and links in text ---------- */

  var lastRange = null;
  var linkBold = false;

  function rememberSelection() {
    var doc = frame.contentDocument;
    if (!doc) return;
    var sel = doc.getSelection();
    if (!sel || !sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    var host = range.commonAncestorContainer;
    if (host.nodeType === 3) host = host.parentNode;
    if (host && host.closest && host.closest('[data-row].sel [data-field]')) lastRange = range.cloneRange();
  }

  function restoreSelection() {
    var doc = frame.contentDocument;
    if (!doc || !lastRange) return false;
    var host = lastRange.commonAncestorContainer;
    if (host.nodeType === 3) host = host.parentNode;
    var field = host && host.closest && host.closest('[data-field]');
    if (!field || !doc.contains(field)) return false;
    field.focus();
    var sel = doc.getSelection();
    sel.removeAllRanges();
    sel.addRange(lastRange);
    return true;
  }

  function format(cmd, value) {
    if (!restoreSelection()) { ED.toast('First click inside the text in the email and select the words.', true); return false; }
    frame.contentDocument.execCommand(cmd, false, value);
    readFields();
    ED.changed();
    queueCheck();
    rememberSelection();
    commit(cmd === 'unlink' ? 'Remove link' : 'Formatting');
    return true;
  }

  function cleanUrl(v) {
    var u = String(v || '').trim();
    if (!u) return '';
    if (/^mailto:/i.test(u) || /^https?:\/\//i.test(u)) return u;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u)) return 'mailto:' + u;
    if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(u)) return 'https://' + u;
    return '';
  }

  function textTools() {
    var box = el('div', 'grp');
    box.appendChild(el('div', 'lab', 'Format the selected words'));
    var bar = el('div', 'fmt');
    [['B', 'bold', 'Bold'], ['I', 'italic', 'Italic'], ['U', 'underline', 'Underline']].forEach(function (b) {
      var x = el('button', 'act fmt-' + b[1], b[0]);
      x.type = 'button';
      x.title = b[2];
      x.setAttribute('aria-label', b[2]);
      x.addEventListener('mousedown', function (e) { e.preventDefault(); });
      x.addEventListener('click', function () { format(b[1]); });
      bar.appendChild(x);
    });
    var unlink = el('button', 'act', 'Remove link');
    unlink.type = 'button';
    unlink.addEventListener('mousedown', function (e) { e.preventDefault(); });
    unlink.addEventListener('click', function () { if (format('unlink')) ED.toast('Link removed.'); });
    bar.appendChild(unlink);
    box.appendChild(bar);

    var linkRow = el('div', 'linkrow');
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'tin';
    inp.placeholder = 'https://… or an email address';
    inp.setAttribute('aria-label', 'Link address');
    var add = el('button', 'btn sm', 'Add link');
    add.type = 'button';
    add.addEventListener('mousedown', function (e) { e.preventDefault(); });
    add.addEventListener('click', function () {
      var url = cleanUrl(inp.value);
      if (!url) { ED.toast('Enter a full link, like https://www.example.com, or an email address.', true); return; }
      var collapsed = !lastRange || lastRange.collapsed;
      if (!restoreSelection()) { ED.toast('First click inside the text in the email and select the words.', true); return; }
      var doc = frame.contentDocument;
      if (collapsed) doc.execCommand('insertHTML', false, '<a href="' + esc(url) + '">' + esc(inp.value.trim()) + '</a>');
      else doc.execCommand('createLink', false, url);
      doc.querySelectorAll('[data-row="' + selected + '"] [data-field] a').forEach(function (a) {
        if (a.getAttribute('href') === url && !a.hasAttribute('data-s')) a.setAttribute('data-s', linkBold ? 'bold' : 'plain');
      });
      readFields(); ED.changed(); queueCheck(); rememberSelection();
      commit('Add link');
      inp.value = '';
      ED.toast('Link added. It opens in a new tab.');
    });
    linkRow.appendChild(inp);
    linkRow.appendChild(add);
    box.appendChild(linkRow);
    var ls = el('div', 'seg');
    ls.style.marginTop = '6px';
    [[false, 'Plain link'], [true, 'Bold link']].forEach(function (o) {
      var b = el('button', '', o[1]);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(linkBold === o[0]));
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function () {
        linkBold = o[0];
        ls.querySelectorAll('button').forEach(function (x, i) { x.setAttribute('aria-pressed', String((i === 1) === linkBold)); });
      });
      ls.appendChild(b);
    });
    box.appendChild(ls);
    box.appendChild(el('div', 'hint', 'Select words in the email, then add the link. Links always open in a new tab: email apps like Gmail and Outlook decide this, not the email.'));
    return box;
  }

  /* ---------- the settings panel ---------- */

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function group(label, child) {
    var g = el('div', 'grp');
    g.appendChild(el('div', 'lab', label));
    g.appendChild(child);
    return g;
  }

  function seg(r, key, options) {
    var box = el('div', 'seg');
    box.setAttribute('role', 'group');
    options.forEach(function (o) {
      var b = el('button', '', o[1]);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(String(r.s[key]) === String(o[0])));
      b.addEventListener('click', function () {
        r.s[key] = o[0];
        if (['width', 'iw', 'layout', 'gap', 'style'].indexOf(key) !== -1) recutRow(r);
        changed(); renderPanel();
      });
      box.appendChild(b);
    });
    return box;
  }

  function colorInput(obj, key, fallback) {
    var wrapEl = el('div', 'colr');
    var pick = document.createElement('input');
    pick.type = 'color';
    pick.value = color(obj[key], fallback).length === 7 ? color(obj[key], fallback) : fallback;
    var text = document.createElement('input');
    text.type = 'text';
    text.value = obj[key] || fallback;
    text.maxLength = 7;
    text.setAttribute('aria-label', 'Colour code');
    pick.addEventListener('input', function () { obj[key] = pick.value.toUpperCase(); text.value = obj[key]; changed(); });
    text.addEventListener('change', function () {
      if (/^#[0-9a-fA-F]{6}$/.test(text.value)) { obj[key] = text.value.toUpperCase(); pick.value = obj[key]; changed(); }
      else text.value = obj[key];
    });
    wrapEl.appendChild(pick);
    wrapEl.appendChild(text);
    return wrapEl;
  }

  function numInput(r, key, min, max, suffix) {
    var wrapEl = el('div', 'num');
    var inp = document.createElement('input');
    inp.type = 'number';
    inp.min = min; inp.max = max;
    inp.value = r.s[key];
    inp.addEventListener('change', function () {
      var v = Math.min(max, Math.max(min, Math.round(Number(inp.value) || 0)));
      inp.value = v; r.s[key] = v;
      if (key === 'px') recutRow(r);
      changed();
    });
    wrapEl.appendChild(inp);
    wrapEl.appendChild(el('span', '', suffix || 'px'));
    return wrapEl;
  }

  function textInput(obj, key, placeholder) {
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'tin';
    inp.value = obj[key] || '';
    inp.placeholder = placeholder || '';
    inp.addEventListener('change', function () { obj[key] = inp.value.trim(); changed(); });
    return inp;
  }

  function spacing(r) {
    var g = el('div', 'two3');
    [['pt', 'Top'], ['pb', 'Bottom'], ['px', 'Sides']].forEach(function (p) {
      var c = el('label', 'mini');
      c.appendChild(el('span', '', p[1]));
      c.appendChild(numInput(r, p[0], 0, 80));
      g.appendChild(c);
    });
    return g;
  }

  function imagePicker(r, widthFn, target) {
    target = target || r.c;
    var box = el('div', 'stack');
    var row2 = el('div', 'two');
    var up = el('button', 'btn sm fill', 'Upload');
    up.type = 'button';
    up.addEventListener('click', function () {
      pending = { r: r, target: target, widthFn: widthFn };
      $('bfile').click();
    });
    var lib = el('button', 'btn sm', 'From library');
    lib.type = 'button';
    lib.addEventListener('click', function () { openLibrary(r, target, widthFn, box); });
    row2.appendChild(up);
    row2.appendChild(lib);
    box.appendChild(row2);

    var link = document.createElement('input');
    link.type = 'text';
    link.className = 'tin';
    link.placeholder = 'or paste an image link (https://…)';
    link.value = target.orig || target.src || '';
    link.addEventListener('change', function () {
      var v = link.value.trim();
      target.orig = v;
      target.src = v;
      if (target.h && v) cut(r, target, widthFn); else { changed(); renderPanel(); }
    });
    box.appendChild(link);
    box.appendChild(heightControl(r, target, widthFn));
    box.appendChild(group('Alt text (shown if images are blocked)', textInput(target, 'alt', 'Describe the image')));
    return box;
  }

  /* Height: Auto keeps the image's own shape; a shape or a number cuts it to exactly width × height. */
  function heightControl(r, target, widthFn) {
    var w = widthFn();
    var g = el('div', 'grp');
    g.appendChild(el('div', 'lab', 'Height · ' + w + ' × ' + (target.h ? target.h + ' px' : 'auto')));
    var segEl = el('div', 'seg');
    var current = target.hs || (target.h ? 'custom' : 'auto');
    HSHAPES.forEach(function (o) {
      var b = el('button', '', o[1]);
      b.type = 'button';
      b.title = o[0] === 'auto' ? 'Keep the image\'s own shape' : 'Width : height ' + o[1];
      b.setAttribute('aria-pressed', String(current === o[0]));
      b.addEventListener('click', function () {
        target.hs = o[0];
        target.h = o[2] ? Math.round(widthFn() * o[2]) : 0;
        cut(r, target, widthFn);
      });
      segEl.appendChild(b);
    });
    g.appendChild(segEl);
    var row3 = el('div', 'hrow');
    row3.style.marginTop = '6px';
    var num = document.createElement('input');
    num.type = 'number';
    num.min = 20; num.max = 2000;
    num.className = 'tin';
    num.style.width = '110px';
    num.style.marginBottom = '0';
    num.placeholder = 'Custom';
    num.setAttribute('aria-label', 'Custom height in px');
    if (current === 'custom' && target.h) num.value = target.h;
    var setBtn = el('button', 'btn sm', 'Set height');
    setBtn.type = 'button';
    setBtn.addEventListener('click', function () {
      var v = Math.round(Number(num.value));
      if (!(v >= 20 && v <= 2000)) { ED.toast('Enter a height between 20 and 2000 px.', true); return; }
      target.hs = 'custom';
      target.h = v;
      cut(r, target, widthFn);
    });
    row3.appendChild(num);
    row3.appendChild(el('span', 'hint', 'px'));
    row3.appendChild(setBtn);
    g.appendChild(row3);
    return g;
  }

  /* Cuts the image to the box (from the original, so quality never drops), or goes back to the original for Auto. */
  function cut(r, target, widthFn) {
    nextLabel = 'Image height';
    var w = widthFn();
    if (!target.h) {
      if (target.orig) target.src = target.orig;
      changed(); renderPanel();
      return;
    }
    var source = target.orig || target.src;
    if (!source) { changed(); renderPanel(); return; }
    if (LIB && source.indexOf(LIB) !== 0) {
      changed(); renderPanel();
      ED.toast('A height can only be set on images from the image library. Upload the image here, or pick it from the library.', true);
      return;
    }
    $('bstate').textContent = '· cutting image…';
    ED.post('/editor/crop', { url: source, width: w, height: target.h }).then(function (j) {
      target.orig = source;
      target.src = j.url;
      $('bstate').textContent = '';
      changed(); renderPanel();
      if (j.warning) ED.toast(j.warning, true);
    }).catch(function (e) { $('bstate').textContent = ''; ED.toast(e.message, true); });
  }

  /* When a width changes, images with a shape keep their shape; images with a custom height keep their height. */
  function recutRow(r) {
    imagesOf(r).forEach(function (it) {
      var t = it.t;
      if (!t.hs || t.hs === 'auto') return;
      var shape = HSHAPES.filter(function (o) { return o[0] === t.hs; })[0];
      if (shape && shape[2]) t.h = Math.round(it.w() * shape[2]);
      if (t.h) cut(r, t, it.w);
    });
  }

  var pending = null;
  $('bfile').addEventListener('change', function () {
    var f = $('bfile').files[0];
    $('bfile').value = '';
    if (!f || !pending) return;
    var target = pending;
    pending = null;
    if (f.size > 10 * 1024 * 1024) { ED.toast('That image is over 10 MB. Make it smaller and try again.', true); return; }
    var body = new FormData();
    body.append('width', String(target.widthFn()));
    body.append('height', String(target.target.h || 0));
    body.append('image', f);
    ED.toast('Uploading…');
    fetch('/editor/upload?ticket=' + encodeURIComponent(ED.ticket), { method: 'POST', body: body })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (j) { if (!res.ok) throw new Error(j.error || 'Upload failed. Try again.'); return j; }); })
      .then(function (j) {
        nextLabel = 'Upload image';
        target.target.src = j.url;
        target.target.orig = j.orig || j.url;
        if (!target.target.alt) target.target.alt = '';
        changed(); renderPanel();
        ED.toast(j.warning || 'Image added. The original is also saved in the image library.', Boolean(j.warning));
      })
      .catch(function (e) { ED.toast(e.message, true); });
  });

  function openLibrary(r, target, widthFn, box) {
    var grid = el('div', 'lib');
    grid.appendChild(el('div', 'hint', 'Loading the image library…'));
    box.appendChild(grid);
    fetch('/editor/images?ticket=' + encodeURIComponent(ED.ticket))
      .then(function (res) { return res.json(); })
      .then(function (j) {
        grid.innerHTML = '';
        if (!j.images || !j.images.length) { grid.appendChild(el('div', 'hint', 'No images yet. Use Upload.')); return; }
        j.images.forEach(function (img) {
          var b = el('button', 'thumb');
          b.type = 'button';
          b.title = img.name;
          var i = document.createElement('img');
          i.src = img.url; i.alt = img.name; i.loading = 'lazy';
          b.appendChild(i);
          b.addEventListener('click', function () {
            target.orig = img.url;
            target.src = img.url;
            if (target.h) cut(r, target, widthFn); else { changed(); renderPanel(); }
          });
          grid.appendChild(b);
        });
      })
      .catch(function () { grid.innerHTML = ''; grid.appendChild(el('div', 'hint', 'The library could not be loaded.')); });
  }

  function toggle(r) {
    var lab = el('label', 'tog');
    lab.appendChild(el('span', '', 'Users can change this (Customise)'));
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = Boolean(r.open);
    cb.addEventListener('change', function () { r.open = cb.checked; changed(cb.checked ? 'Allow users to change' : 'Lock for users'); });
    lab.appendChild(cb);
    return lab;
  }

  function fontSelect(r) {
    var wrapEl = el('div');
    var sel = document.createElement('select');
    sel.className = 'fsel';
    sel.setAttribute('aria-label', 'Font');
    FONTS.forEach(function (f) {
      var o = document.createElement('option');
      o.value = f.name; o.textContent = f.name;
      o.style.fontFamily = f.stack;
      sel.appendChild(o);
    });
    sel.value = fontOf(r.s.font || 'Arial').name;
    sel.style.fontFamily = fontStack(sel.value);
    sel.addEventListener('change', function () { r.s.font = sel.value; changed(); renderPanel(); });
    wrapEl.appendChild(sel);
    var f = fontOf(sel.value);
    if (f.web) wrapEl.appendChild(el('div', 'hint', 'Gmail cannot send this font, so it shows only where it is installed. Most people see ' + f.backup + '.'));
    return wrapEl;
  }

  function sizeSelect(r, key, fallback) {
    var sel = document.createElement('select');
    sel.className = 'fsel';
    sel.setAttribute('aria-label', 'Font size');
    for (var n = 10; n <= 72; n++) {
      var o = document.createElement('option');
      o.value = String(n); o.textContent = n + ' px';
      sel.appendChild(o);
    }
    sel.value = String(px(r.s[key]) || fallback);
    sel.addEventListener('change', function () { r.s[key] = Number(sel.value); changed(); });
    return sel;
  }

  function textSettings(r, withAlign) {
    var box = el('div');
    var fs = el('div', 'two');
    fs.appendChild(group('Font', fontSelect(r)));
    fs.appendChild(group('Size', sizeSelect(r, 'size', 14)));
    box.appendChild(fs);
    var two = el('div', 'two');
    two.appendChild(group('Text colour', colorInput(r.s, 'color', '#1F1F1F')));
    two.appendChild(group('Background', colorInput(r.s, 'bg', '#FFFFFF')));
    box.appendChild(two);
    box.appendChild(group('Line spacing', seg(r, 'lh', [['tight', 'Tight'], ['normal', 'Normal'], ['loose', 'Loose']])));
    if (withAlign) box.appendChild(group('Alignment', seg(r, 'align', [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']])));
    return box;
  }

  function renderPanel() {
    panel.innerHTML = '';
    var r = selected && row(selected);
    if (!r) {
      panel.appendChild(el('div', 'bh', 'EMAIL SETTINGS'));
      panel.appendChild(el('p', 'hint', 'Click a row in the email to change it, or add a row from the left. New rows go under the selected row.'));
      var wseg = el('div', 'seg');
      var cw = emailW();
      WIDTHS.forEach(function (wv) {
        var b = el('button', '', wv + (wv === 600 ? ' ✓' : ''));
        b.type = 'button';
        b.title = wv === 600 ? 'Standard, safest everywhere' : wv + ' px';
        b.setAttribute('aria-pressed', String(cw === wv));
        b.addEventListener('click', function () { setWidth(wv); });
        wseg.appendChild(b);
      });
      panel.appendChild(group('Email width (px) · 600 is the standard', wseg));
      var crow = el('div', 'hrow');
      var cnum = document.createElement('input');
      cnum.type = 'number'; cnum.min = 480; cnum.max = 800;
      cnum.className = 'tin'; cnum.style.width = '110px'; cnum.style.marginBottom = '0';
      cnum.placeholder = 'Custom';
      cnum.setAttribute('aria-label', 'Custom email width in px');
      if (WIDTHS.indexOf(cw) === -1) cnum.value = cw;
      var cset = el('button', 'btn sm', 'Set width');
      cset.type = 'button';
      cset.addEventListener('click', function () {
        var v = Math.round(Number(cnum.value));
        if (!(v >= 480 && v <= 800)) { ED.toast('Enter a width between 480 and 800 px.', true); return; }
        setWidth(v);
      });
      crow.appendChild(cnum); crow.appendChild(el('span', 'hint', 'px')); crow.appendChild(cset);
      panel.appendChild(group('Custom width (480 to 800)', crow));
      if (cw > 640) panel.appendChild(el('div', 'hint', 'Wider than 640 px can be cut off in Outlook and narrow reading panes.'));
      var two = el('div', 'two');
      two.appendChild(group('Page background', colorInput(model, 'page', '#F1F3F4')));
      two.appendChild(group('Email background', colorInput(model, 'bg', '#FFFFFF')));
      panel.appendChild(two);
      return;
    }
    var head = el('div', 'phead');
    head.appendChild(el('div', 'bh', TYPES[r.type].name.toUpperCase() + ' ROW'));
    var acts = el('div', 'acts');
    [['↑', 'Move up', function () { move(-1); }], ['↓', 'Move down', function () { move(1); }], ['Copy', 'Copy this row', copyRow], ['Delete', 'Delete this row', delRow]].forEach(function (a) {
      var b = el('button', a[0] === 'Delete' ? 'act del' : 'act', a[0]);
      b.type = 'button';
      b.title = a[1];
      b.setAttribute('aria-label', a[1]);
      b.addEventListener('click', a[2]);
      acts.appendChild(b);
    });
    head.appendChild(acts);
    panel.appendChild(head);

    switch (r.type) {
      case 'header':
        panel.appendChild(group('Style', seg(r, 'style', [['text', 'Text logo'], ['image', 'Image']])));
        if (r.s.style === 'image') {
          panel.appendChild(imagePicker(r, function () { return innerWidth(r); }));
          panel.appendChild(group('Link when clicked (optional)', textInput(r.c, 'link', 'https://')));
        } else {
          panel.appendChild(el('p', 'hint', 'Click the logo text in the email to type.'));
          panel.appendChild(textTools());
          var hf = el('div', 'two');
          hf.appendChild(group('Font', fontSelect(r)));
          hf.appendChild(group('Size', sizeSelect(r, 'size', 22)));
          panel.appendChild(hf);
          var t2 = el('div', 'two');
          t2.appendChild(group('Text colour', colorInput(r.s, 'color', '__INK__')));
          t2.appendChild(group('Background', colorInput(r.s, 'bg', '#FFFFFF')));
          panel.appendChild(t2);
          panel.appendChild(group('Alignment', seg(r, 'align', [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']])));
        }
        break;
      case 'image':
        panel.appendChild(imagePicker(r, function () { return imageWidth(r); }));
        panel.appendChild(group('Width', seg(r, 'width', [['full', 'Full'], [480, '480'], [300, '300'], [200, '200']])));
        if (r.s.width !== 'full') panel.appendChild(group('Alignment', seg(r, 'align', [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']])));
        panel.appendChild(group('Link when clicked (optional)', textInput(r.c, 'link', 'https://')));
        panel.appendChild(group('Background', colorInput(r.s, 'bg', '#FFFFFF')));
        break;
      case 'text':
        panel.appendChild(el('p', 'hint', 'Click the text in the email to type.'));
        panel.appendChild(textTools());
        panel.appendChild(textSettings(r, true));
        panel.appendChild(group('Weight', seg(r, 'weight', [['normal', 'Normal'], ['bold', 'Bold']])));
        break;
      case 'button':
        panel.appendChild(group('Button text', textInput(r.c, 'label', 'Learn more')));
        panel.appendChild(group('Link', textInput(r.c, 'url', 'https://')));
        var bf = el('div', 'two');
        bf.appendChild(group('Font', fontSelect(r)));
        bf.appendChild(group('Size', sizeSelect(r, 'size', 15)));
        panel.appendChild(bf);
        var b2 = el('div', 'two');
        b2.appendChild(group('Button colour', colorInput(r.s, 'bgc', '__ACCENT__')));
        b2.appendChild(group('Text colour', colorInput(r.s, 'color', '#FFFFFF')));
        panel.appendChild(b2);
        panel.appendChild(group('Alignment', seg(r, 'align', [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']])));
        panel.appendChild(group('Corners', seg(r, 'radius', [[0, 'Square'], [6, 'Rounded'], [24, 'Pill']])));
        panel.appendChild(group('Background', colorInput(r.s, 'bg', '#FFFFFF')));
        break;
      case 'imageText':
        panel.appendChild(imagePicker(r, function () { return sideImageWidth(r); }));
        panel.appendChild(group('Image side', seg(r, 'side', [['left', 'Left'], ['right', 'Right']])));
        panel.appendChild(group('Image width', seg(r, 'iw', [[120, '120'], [160, '160'], [200, '200'], [260, '260']])));
        panel.appendChild(el('p', 'hint', 'Click the text in the email to type.'));
        panel.appendChild(textTools());
        panel.appendChild(textSettings(r, false));
        break;
      case 'cols':
        panel.appendChild(group('Layout', seg(r, 'layout', [['1:1', '½ ½'], ['1:2', '⅓ ⅔'], ['2:1', '⅔ ⅓'], ['1:1:1', '⅓ ⅓ ⅓']])));
        var need = (LAYOUTS[r.s.layout] || LAYOUTS['1:1']).length;
        while (r.c.cols.length < need) r.c.cols.push({ kind: 'text', html: 'Column text. Click to type.' });
        var pctsP = LAYOUTS[r.s.layout] || LAYOUTS['1:1'];
        var anyText = false;
        for (var ci = 0; ci < need; ci++) {
          (function (i) {
            var col = r.c.cols[i];
            var box = el('div', 'colbox');
            box.appendChild(el('div', 'bh', 'COLUMN ' + (i + 1)));
            var kinds = el('div', 'seg');
            [['text', 'Text'], ['image', 'Image'], ['button', 'Button']].forEach(function (k) {
              var b = el('button', '', k[1]);
              b.type = 'button';
              b.setAttribute('aria-pressed', String(col.kind === k[0]));
              b.addEventListener('click', function () {
                col.kind = k[0];
                if (k[0] === 'text' && !col.html) col.html = 'Column text. Click to type.';
                if (k[0] === 'button') { col.label = col.label || 'Learn more'; col.url = col.url || '__SITE_JS__/'; }
                changed(); renderPanel();
              });
              kinds.appendChild(b);
            });
            box.appendChild(kinds);
            if (col.kind === 'image') {
              box.appendChild(imagePicker(r, function () { return colWidths(r)[i] || 200; }, col));
              box.appendChild(group('Link when clicked (optional)', textInput(col, 'link', 'https://')));
            } else if (col.kind === 'button') {
              box.appendChild(group('Button text', textInput(col, 'label', 'Learn more')));
              box.appendChild(group('Link', textInput(col, 'url', 'https://')));
            } else {
              anyText = true;
              box.appendChild(el('div', 'hint', 'Click this column in the email to type.'));
            }
            panel.appendChild(box);
          })(ci);
        }
        if (r.c.cols.length > need) r.c.cols.length = need;
        if (anyText) panel.appendChild(textTools());
        panel.appendChild(group('Line up columns', seg(r, 'valign', [['top', 'Top'], ['middle', 'Middle']])));
        panel.appendChild(group('Gap between columns', seg(r, 'gap', [[12, '12'], [20, '20'], [32, '32']])));
        panel.appendChild(textSettings(r, false));
        if (r.c.cols.some(function (c) { return c.kind === 'button'; })) {
          var bb = el('div', 'two');
          bb.appendChild(group('Button colour', colorInput(r.s, 'bgc', '__ACCENT__')));
          bb.appendChild(group('Button text colour', colorInput(r.s, 'btncolor', '#FFFFFF')));
          panel.appendChild(bb);
        }
        break;
      case 'twoCols':
        panel.appendChild(el('p', 'hint', 'Click either column in the email to type.'));
        panel.appendChild(textTools());
        panel.appendChild(textSettings(r, false));
        break;
      case 'divider':
        var d2 = el('div', 'two');
        d2.appendChild(group('Line colour', colorInput(r.s, 'color', '#DADCE0')));
        d2.appendChild(group('Thickness', seg(r, 'thick', [[1, '1'], [2, '2'], [4, '4']])));
        panel.appendChild(d2);
        panel.appendChild(group('Background', colorInput(r.s, 'bg', '#FFFFFF')));
        break;
      case 'space':
        panel.appendChild(group('Height', seg(r, 'h', [[12, '12'], [24, '24'], [40, '40'], [64, '64']])));
        panel.appendChild(group('Background', colorInput(r.s, 'bg', '#FFFFFF')));
        break;
      case 'footer':
        panel.appendChild(el('p', 'hint', 'Click the footer text in the email to type.'));
        panel.appendChild(textTools());
        panel.appendChild(textSettings(r, true));
        break;
    }
    if (r.type !== 'space') panel.appendChild(group('Space around', spacing(r)));
    panel.appendChild(toggle(r));
  }

  function setWidth(v) {
    model.width = v;
    model.rows.forEach(recutRow);
    changed('Email width'); renderPanel();
  }

  /* ---------- row actions ---------- */

  function addRow(type) {
    if (selected) readFields();
    var r = makeRow(type);
    var i = selected ? rowIndex(selected) + 1 : model.rows.length;
    model.rows.splice(i, 0, r);
    selected = r.id;
    changed('Add ' + TYPES[type].name + ' row');
    renderPanel();
    setTimeout(function () {
      var e = frame.contentDocument && frame.contentDocument.querySelector('[data-row="' + r.id + '"]');
      if (e) e.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 150);
  }

  function move(d) {
    readFields();
    var i = rowIndex(selected);
    var j = i + d;
    if (i < 0 || j < 0 || j >= model.rows.length) return;
    var t = model.rows[i]; model.rows[i] = model.rows[j]; model.rows[j] = t;
    changed('Move row');
  }

  function copyRow() {
    readFields();
    var i = rowIndex(selected);
    var copy = JSON.parse(JSON.stringify(model.rows[i]));
    copy.id = newId();
    model.rows.splice(i + 1, 0, copy);
    selected = copy.id;
    changed('Copy row'); renderPanel();
  }

  function delRow() {
    var i = rowIndex(selected);
    if (i < 0) return;
    if (!confirm('Delete this ' + TYPES[model.rows[i].type].name.toLowerCase() + ' row?')) return;
    var gone = TYPES[model.rows[i].type].name;
    model.rows.splice(i, 1);
    selected = null;
    changed('Delete ' + gone + ' row'); renderPanel();
  }

  var pal = $('palette');
  ORDER.forEach(function (type) {
    var b = el('button', 'pitem');
    b.type = 'button';
    b.appendChild(el('i'));
    b.appendChild(document.createTextNode(TYPES[type].name));
    b.addEventListener('click', function () { addRow(type); });
    pal.appendChild(b);
  });
  pal.appendChild(el('small', '', 'Click a row type to add it under the selected row.'));

  /* ---------- Edit | Preview, Desktop | Mobile ---------- */

  function setPreview(on) {
    if (selected) readFields();
    previewMode = on;
    $('bEdit').setAttribute('aria-pressed', String(!on));
    $('bPreview').setAttribute('aria-pressed', String(on));
    if (on) { $('bstate').textContent = '· what people receive'; runCheck(); }
    else { $('bstate').textContent = ''; }
    render();
  }
  $('bEdit').addEventListener('click', function () { setPreview(false); });
  $('bPreview').addEventListener('click', function () { setPreview(true); });
  function setMobile(on) {
    $('canvas').classList.toggle('mobile', on);
    $('bDesk').setAttribute('aria-pressed', String(!on));
    $('bMob').setAttribute('aria-pressed', String(on));
  }
  $('bDesk').addEventListener('click', function () { setMobile(false); });
  $('bMob').addEventListener('click', function () { setMobile(true); });

  /* ---------- switching between blocks and code ---------- */

  function setView(blocks) {
    active = blocks;
    $('blocksView').hidden = !blocks;
    $('htmlView').hidden = blocks;
    $('tabBlocks').setAttribute('aria-pressed', String(blocks));
    $('tabHtml').setAttribute('aria-pressed', String(!blocks));
  }

  /* A small pop-up with clear choices (instead of the browser's OK / Cancel box). */
  function ask(title, text, choices) {
    var box = $('switchBox');
    $('switchTitle').textContent = title;
    $('switchText').textContent = text;
    var btns = $('switchBtns');
    btns.innerHTML = '';
    function close() { box.hidden = true; document.removeEventListener('keydown', onKey, true); }
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
    choices.forEach(function (c) {
      var b = el('button', 'btn' + (c.fill ? ' fill' : ''), c.label);
      b.type = 'button';
      b.addEventListener('click', function () { close(); if (c.fn) c.fn(); });
      btns.appendChild(b);
    });
    box.hidden = false;
    document.addEventListener('keydown', onKey, true);
    var last = btns.lastElementChild;
    if (last) last.focus();
  }

  /* The pasted code is kept here while the admin tries blocks, so it can always come back. */
  var keptCode = null;
  var blocksWhenEntered = null;

  function goToBlocks() {
    keptCode = ED.code().trim() ? ED.code() : null;
    if (!model) model = starter();
    selected = null;
    setView(true);
    commit('Build with blocks');
    blocksWhenEntered = JSON.stringify(model);
    render(); renderPanel(); runCheck(); ED.changed();
  }

  function backToCode(codeText) {
    ED.setCode(codeText);
    setView(false);
    keptCode = null;
    blocksWhenEntered = null;
    ED.changed();
  }

  $('tabBlocks').addEventListener('click', function () {
    if (active) return;
    if (!ED.code().trim()) { goToBlocks(); return; }
    ask('Build with blocks?',
      'Pasted code can\'t be turned into blocks, so blocks start from a fresh email. Your code is kept safe: click Paste HTML to get it back. It is only replaced if you save or publish while in blocks.',
      [{ label: 'Cancel' }, { label: 'Start with blocks', fill: true, fn: goToBlocks }]);
  });

  $('tabHtml').addEventListener('click', function () {
    if (!active) return;
    readFields();
    flushTyping();
    var fromBlocks = toHtml(model, false);
    if (keptCode !== null) {
      if (JSON.stringify(model) === blocksWhenEntered) { backToCode(keptCode); ED.toast('Your pasted code is back.'); return; }
      var kept = keptCode;
      ask('Back to Paste HTML',
        'You changed the blocks. Which email do you want in the code box?',
        [{ label: 'Cancel' },
         { label: 'My pasted code', fn: function () { backToCode(kept); ED.toast('Your pasted code is back.'); } },
         { label: 'Code from the blocks', fill: true, fn: function () { backToCode(fromBlocks); } }]);
      return;
    }
    ask('Switch to code?',
      'The code from your blocks is copied into the code box. If you save in code, block editing stops for this template.',
      [{ label: 'Cancel' }, { label: 'Switch to code', fill: true, fn: function () { backToCode(fromBlocks); } }]);
  });

  /* ---------- what the page asks for ---------- */

  window.BUILDER = {
    active: function () { return active; },
    payload: function () {
      if (selected) readFields();
      return { sourceHtml: toHtml(model, false), blocks: model, mode: 'blocks', locks: [] };
    }
  };

  /* ---------- start ---------- */

  var boot = ED.boot;
  if (boot.mode === 'blocks' && boot.blocks && boot.blocks.rows) {
    model = boot.blocks;
    setView(true);
  } else if (!boot.sourceHtml) {
    model = starter();
    setView(true);
  } else {
    setView(false);
  }
  if (active) { render(); renderPanel(); runCheck(); }
  if (model) commit('');
  urButtons();
  ED.ready();
})();
