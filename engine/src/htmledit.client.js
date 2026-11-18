/*
 * __APP__ — Paste HTML extras (runs in the admin's browser).
 *
 * 1. Undo and redo for code edits, Edit in preview changes and lock changes.
 * 2. Edit in preview, with the same tools as Build with blocks:
 *    - text: font, size, colour, bold / italic / underline, alignment, links
 *    - buttons: words, link, button colour, text colour, corners
 *    - images: copy into library, upload, library, link, height, alt text, click link
 *    - rows (each table row of the email): add a row (text, image, image + text,
 *      button, columns, divider, space, header, footer), drag, move, copy,
 *      lock for users, background, spacing, delete
 *    Every change is written straight back into the code box.
 *
 * Rows are the rows of the email's main table, the way email code from Figma
 * plugins, Gemini, ChatGPT and Claude is built. Code built from boxes (like a
 * web page) has no rows: then only text, button and image editing work.
 *
 * Talks to the page through window.ED.html (set up by the editor page script).
 * The floating tools live in the editor page, on top of the preview, so they
 * never end up in the email.
 */
(function () {
  'use strict';
  var ED = window.ED;
  if (!ED || !ED.html) return;
  var H = ED.html;
  var $ = function (id) { return document.getElementById(id); };
  var code = H.codeEl;
  var frame = H.frame;
  var stage = $('stage');
  var hintBar = $('editTools');
  var LIB = ED.libraryPrefix || '';
  var FONTS = ED.fonts || [];
  var PLACEHOLDER = location.origin + '/assets/placeholder-image.png';
  var BRAND = __SWATCHES__;
  var SIZES = [10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28, 30, 32, 36, 40, 44, 48, 54, 60, 66, 72];
  var SPACES = [0, 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80];
  var CORNERS = [[0, 'Square'], [4, '4 px'], [6, '6 px'], [8, '8 px'], [12, '12 px'], [20, '20 px'], [999, 'Round']];
  var HSHAPES = [['auto', 'Auto', 0], ['1:1', '1:1', 1], ['3:4', '3:4', 4 / 3], ['4:5', '4:5', 1.25], ['16:9', '16:9', 9 / 16], ['2:1', '2:1', 0.5], ['3:1', '3:1', 1 / 3]];
  /* Must match blocks.js on the server, so the part ids stay the same. */
  var TEXT_HOLDERS = 'td, th, p, div, h1, h2, h3, h4, h5, h6, li, blockquote';
  var LAYOUT = 'table, tbody, thead, tfoot, tr, td, th, div, p, h1, h2, h3, h4, h5, h6, ul, ol, li, img, center, section, blockquote, hr';

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function htmlVisible() { return !$('htmlView').hidden; }

  /** 'rgb(23, 18, 59)' -> '#17123B'; transparent -> '' */
  function hex(c) {
    var m = String(c || '').match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/);
    if (!m) return /^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? String(c).toUpperCase() : '';
    if (m[4] !== undefined && Number(m[4]) === 0) return '';
    return '#' + [m[1], m[2], m[3]].map(function (n) { return ('0' + Number(n).toString(16)).slice(-2); }).join('').toUpperCase();
  }

  function cleanUrl(v) {
    var u = String(v || '').trim();
    if (!u) return '';
    if (/^mailto:/i.test(u) || /^https?:\/\//i.test(u)) return u;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u)) return 'mailto:' + u;
    if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(u)) return 'https://' + u;
    return '';
  }

  /* ================= Undo and redo ================= */

  function snap(label) { return { code: code.value, locks: JSON.stringify(H.getLocks().sort()), label: label || '' }; }
  var past = [];
  var future = [];
  var current = snap('');
  var typingTimer = null;

  function same(a, b) { return a.code === b.code && a.locks === b.locks; }

  function commit(label) {
    clearTimeout(typingTimer);
    typingTimer = null;
    var s = snap(label);
    if (same(s, current)) { urButtons(); return; }
    past.push(current);
    if (past.length > 50) past.shift();
    current = s;
    future = [];
    urButtons();
  }

  function commitSoon(label) {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(function () { commit(label); }, 700);
  }

  function flushTyping() { if (typingTimer) commit('Typing'); }

  function apply(state) {
    code.value = state.code;
    H.setLocks(JSON.parse(state.locks));
    H.setStatus();
    H.check();
    urButtons();
  }

  function undo() {
    flushTyping();
    if (!past.length) return;
    var label = current.label || 'Change';
    future.push(current);
    current = past.pop();
    apply(current);
    ED.toast('Undone: ' + label);
  }

  function redo() {
    flushTyping();
    if (!future.length) return;
    past.push(current);
    current = future.pop();
    apply(current);
    ED.toast('Redone: ' + (current.label || 'Change'));
  }

  function urButtons() {
    var u = $('hUndo');
    var r = $('hRedo');
    u.disabled = !past.length && !typingTimer;
    r.disabled = !future.length;
    u.title = past.length ? 'Undo: ' + (current.label || 'Change') + ' (Cmd + Z)' : 'Nothing to undo';
    r.title = future.length ? 'Redo: ' + (future[future.length - 1].label || 'Change') + ' (Cmd + Shift + Z)' : 'Nothing to redo';
  }

  $('hUndo').addEventListener('click', undo);
  $('hRedo').addEventListener('click', redo);
  code.addEventListener('input', function () { commitSoon('Code edit'); urButtons(); });
  ED.onLocksChanged = function () { commit('Lock change'); };
  ED.onCodeSet = function () { commit('Switch from blocks'); };

  function undoKeys(e) {
    if (!(e.metaKey || e.ctrlKey) || (e.key !== 'z' && e.key !== 'Z')) return false;
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
    return true;
  }
  document.addEventListener('keydown', function (e) {
    if (!htmlVisible()) return;
    var a = document.activeElement;
    if (a && a !== code && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return;
    undoKeys(e);
  }, true);

  /* ================= Edit in preview ================= */

  var editMode = false;
  var doc = null;          /* the preview's document */
  var root = null;         /* the email inside it */
  var table = null;        /* the email's main table (its rows are the email's rows), or null */
  var selBlock = null;     /* selected text, button or image */
  var selRow = null;       /* selected row (a <tr> of the main table) */
  var selBlockId = null;   /* to find them again after the preview is redrawn */
  var selRowIdx = -1;
  var rowPanel = false;    /* row settings open instead of the part's tools */
  var lastRange = null;
  var linkOpen = false;
  var linkBold = false;
  var origBySrc = {};      /* cut image -> its original in the library */
  var heightBySrc = {};    /* cut image -> its height */
  var items = [];          /* floating tools and where they sit */

  var ov = el('div', 'ov');
  ov.setAttribute('aria-label', 'Editing tools');
  stage.appendChild(ov);

  function setButtons(mode) {
    $('modePreview').setAttribute('aria-pressed', String(mode === 'preview'));
    $('modeEdit').setAttribute('aria-pressed', String(mode === 'edit'));
    $('modeLocks').setAttribute('aria-pressed', String(mode === 'locks'));
  }

  function enterEdit() {
    if (!code.value.trim()) { ED.toast('Paste your code first.', true); return; }
    if (H.isLockMode()) H.setLockMode(false);
    editMode = true;
    selBlock = selRow = null; selBlockId = null; selRowIdx = -1; rowPanel = false;
    setButtons('edit');
    $('checks').hidden = true;
    $('lockList').hidden = true;
    hintBar.hidden = false;
    hintBar.innerHTML = '';
    stage.classList.add('editing');
    $('paneTitle').textContent = 'EDIT IN PREVIEW';
    H.check();
  }

  function exitEdit(recheck) {
    if (!editMode) return;
    flushTyping();
    editMode = false;
    selBlock = selRow = null; selBlockId = null; selRowIdx = -1;
    clearOverlay();
    hintBar.hidden = true;
    stage.classList.remove('editing');
    if (recheck !== false) {
      $('checks').hidden = false;
      $('paneTitle').textContent = 'GMAIL-READY PREVIEW';
      H.check();
    }
  }

  $('modeEdit').addEventListener('click', function () { if (!editMode) enterEdit(); });
  $('modePreview').addEventListener('click', function () { exitEdit(true); setButtons('preview'); });
  ED.onLockMode = function (on) {
    if (on && editMode) { exitEdit(false); setTimeout(H.check, 0); }
    if (on) setButtons('locks');
  };
  ['desk', 'mob'].forEach(function (id) { $(id).addEventListener('click', function () { setTimeout(place, 260); }); });
  window.addEventListener('resize', function () { place(); });

  var EDIT_CSS = 'body{padding:0 44px !important}' +
    '[data-b]{cursor:pointer;outline:2px dashed transparent;outline-offset:-2px}' +
    '[data-b]:hover{outline-color:__ACCENT_LIGHT__}' +
    '.x-bsel{outline:2px solid __ACCENT__ !important;outline-offset:-2px}' +
    '[contenteditable="true"]{caret-color:__ACCENT__;cursor:text}' +
    'tr{cursor:default}';

  ED.onPreviewLoad = function (d) {
    if (!editMode) return;
    doc = d;
    root = d.querySelector('.email');
    var st = d.createElement('style');
    st.textContent = EDIT_CSS;
    d.head.appendChild(st);
    table = findRows();
    d.addEventListener('click', onFrameClick, true);
    d.addEventListener('input', function (e) {
      if (!selBlock || !e.target.closest || !e.target.closest('[contenteditable="true"]')) return;
      written('Typing', true);
    });
    d.addEventListener('dragstart', function (e) { e.preventDefault(); }, true);
    d.addEventListener('drop', function (e) { e.preventDefault(); }, true);
    d.addEventListener('paste', function (e) {
      if (!e.target.closest || !e.target.closest('[contenteditable="true"]')) return;
      e.preventDefault();
      d.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
    });
    d.addEventListener('keydown', function (e) {
      if (undoKeys(e)) return;
      if (e.key === 'Escape') { selectNone(); return; }
      if (e.key === 'Enter' && e.target.closest && e.target.closest('[contenteditable="true"]')) {
        e.preventDefault();
        d.execCommand('insertLineBreak');
      }
    });
    ['selectionchange', 'mouseup', 'keyup'].forEach(function (ev) { d.addEventListener(ev, remember); });
    d.defaultView.addEventListener('scroll', place);

    /* find the selection again after the preview was redrawn (undo, redo) */
    var b = selBlockId ? root.querySelector('[data-b="' + selBlockId + '"]') : null;
    var r = table && selRowIdx >= 0 ? table.rows[selRowIdx] : null;
    selBlock = null; selRow = null;
    if (b) selectBlock(b, r || rowOf(b), true);
    else if (r) selectRow(r);
    else renderAll();
    renderHint();
  };

  /* ---------- finding the rows ---------- */

  /** The table whose rows are the email's sections: it holds (nearly) all the parts and has the most rows. */
  function findRows() {
    if (!root) return null;
    var total = root.querySelectorAll('[data-b]').length;
    var best = null;
    root.querySelectorAll('table').forEach(function (t) {
      var n = t.rows.length;
      if (n < 2) return;
      var inside = t.querySelectorAll('[data-b]').length;
      if (inside < Math.max(1, Math.ceil(total * 0.8))) return;
      if (!best || n > best.rows.length || (n === best.rows.length && best.contains(t))) best = t;
    });
    return best;
  }

  function rowIndex(tr) { return table && tr ? Array.prototype.indexOf.call(table.rows, tr) : -1; }

  function rowOf(node) {
    if (!table) return null;
    for (var n = node; n && n !== table && n !== root; n = n.parentElement) {
      if (n.tagName === 'TR' && rowIndex(n) !== -1) return n;
    }
    return null;
  }

  /** Gives every part its id, exactly like markBlocks on the server. */
  function remark() {
    root.querySelectorAll('[data-b]').forEach(function (n) { n.removeAttribute('data-b'); });
    root.querySelectorAll('img').forEach(function (n, i) { n.setAttribute('data-b', 'i' + i); });
    var k = 0;
    root.querySelectorAll(TEXT_HOLDERS).forEach(function (n) {
      if (n.querySelector(LAYOUT)) return;
      if (!n.textContent.trim()) return;
      if (n.parentElement && n.parentElement.closest('[data-b^="t"]')) return;
      n.setAttribute('data-b', 't' + (k++));
    });
  }

  /* ---------- selecting ---------- */

  function onFrameClick(e) {
    var a = e.target.closest && e.target.closest('a');
    if (a) e.preventDefault();
    var b = e.target.closest && e.target.closest('[data-b]');
    if (b) { if (b !== selBlock || rowPanel) selectBlock(b, rowOf(b)); return; }
    var r = rowOf(e.target);
    if (r) { selectRow(r); return; }
    selectNone();
  }

  function clearEditable() {
    if (!selBlock) return;
    selBlock.classList.remove('x-bsel');
    if (!selBlock.getAttribute('class')) selBlock.removeAttribute('class');
    selBlock.removeAttribute('contenteditable');
    selBlock.removeAttribute('spellcheck');
  }

  function selectBlock(b, r, quiet) {
    flushTyping();
    clearEditable();
    if (b !== selBlock) { lastRange = null; linkOpen = false; }
    selBlock = b;
    selBlockId = b.getAttribute('data-b');
    selRow = r || null;
    selRowIdx = rowIndex(selRow);
    rowPanel = false;
    b.classList.add('x-bsel');
    if (b.tagName !== 'IMG' && !isButton(b)) {
      b.setAttribute('contenteditable', 'true');
      b.setAttribute('spellcheck', 'true');
      if (!quiet) b.focus();
    }
    renderAll();
  }

  function selectRow(r) {
    flushTyping();
    clearEditable();
    selBlock = null; selBlockId = null;
    selRow = r; selRowIdx = rowIndex(r);
    rowPanel = true;
    renderAll();
  }

  function selectNone() {
    flushTyping();
    clearEditable();
    selBlock = selRow = null; selBlockId = null; selRowIdx = -1; rowPanel = false;
    renderAll();
  }

  function remember() {
    if (!doc || !selBlock || selBlock.tagName === 'IMG') return;
    var sel = doc.getSelection();
    if (!sel || !sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    var host = range.commonAncestorContainer;
    if (host.nodeType === 3) host = host.parentNode;
    if (host && selBlock.contains(host)) lastRange = range.cloneRange();
  }

  function restore() {
    if (!selBlock || !lastRange) return false;
    selBlock.focus();
    var sel = doc.getSelection();
    sel.removeAllRanges();
    sel.addRange(lastRange);
    return true;
  }

  /* ---------- writing the preview back into the code box ---------- */

  function serialize() {
    if (!root) return code.value;
    var copy = root.cloneNode(true);
    copy.querySelectorAll('*').forEach(function (n) {
      ['data-b', 'contenteditable', 'spellcheck', 'data-new'].forEach(function (a) { n.removeAttribute(a); });
      n.classList.remove('x-bsel');
      n.classList.remove('esel');
      if (n.getAttribute('class') === '') n.removeAttribute('class');
    });
    var first = copy.firstElementChild;
    var inner = (copy.children.length === 1 && first && first.tagName === 'DIV' && /font-family/i.test(first.getAttribute('style') || '')) ? first.innerHTML : copy.innerHTML;
    return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>' + esc(ED.name() || 'Email') + '</title>\n</head>\n<body style="margin:0;">\n' + inner + '\n</body>\n</html>';
  }

  function written(label, typing) {
    code.value = serialize();
    H.setStatus();
    if (typing) commitSoon(label); else commit(label);
    urButtons();
    place();
  }

  /** Changes that add, move or remove parts: ids are given again and locks follow their parts. */
  function structural(label, fn) {
    flushTyping();
    var lockedEls = H.getLocks().map(function (id) { return root.querySelector('[data-b="' + id + '"]'); }).filter(Boolean);
    clearEditable();
    var keep = selBlock;
    var out = fn() || {};
    remark();
    H.setLocks(lockedEls.filter(function (n) { return root.contains(n); }).map(function (n) { return n.getAttribute('data-b'); }));
    selBlock = null;
    if (out.row) { selRow = out.row; rowPanel = !out.block; }
    if (out.block) selBlock = out.block;
    else if (!out.row && keep && root.contains(keep)) selBlock = keep;
    if (selRow && !root.contains(selRow)) selRow = null;
    selRowIdx = rowIndex(selRow);
    selBlockId = selBlock ? selBlock.getAttribute('data-b') : null;
    if (selBlock) {
      selBlock.classList.add('x-bsel');
      if (selBlock.tagName !== 'IMG' && !isButton(selBlock)) selBlock.setAttribute('contenteditable', 'true');
    }
    written(label, false);
    renderAll();
  }

  /* ---------- the floating tools ---------- */

  function clearOverlay() { ov.innerHTML = ''; items = []; }

  function put(node, anchor, where) {
    ov.appendChild(node);
    items.push({ node: node, anchor: anchor, where: where });
    return node;
  }

  function place() {
    if (!editMode || !doc) return;
    var fr = frame.getBoundingClientRect();
    var sr = stage.getBoundingClientRect();
    var ox = fr.left - sr.left;
    var oy = fr.top - sr.top;
    var mail = root ? root.getBoundingClientRect() : { left: 0 };
    items.forEach(function (it) {
      if (!it.anchor || !it.anchor.isConnected) { it.node.style.display = 'none'; return; }
      it.node.style.display = '';
      var r = it.anchor.getBoundingClientRect();
      var n = it.node;
      var w = n.offsetWidth;
      var h = n.offsetHeight;
      var x, y;
      if (it.where === 'box') {
        n.style.left = (ox + r.left) + 'px'; n.style.top = (oy + r.top) + 'px';
        n.style.width = r.width + 'px'; n.style.height = r.height + 'px';
        return;
      }
      if (it.where === 'rail') { x = ox + mail.left - w - 8; y = oy + r.top; }
      else if (it.where === 'plus') { x = ox + r.left + r.width / 2 - w / 2; y = oy + r.bottom - h / 2; }
      else if (it.where === 'above') {
        x = ox + r.left + r.width / 2 - w / 2; y = oy + r.top - h - 8;
        if (y < 4) y = oy + r.bottom + 8;
      } else { /* below */
        x = ox + r.left + r.width / 2 - w / 2; y = oy + r.bottom + 8;
        if (y + h > sr.height - 4 && oy + r.top - h - 8 > 4) y = oy + r.top - h - 8;
        if (y + h > sr.height - 4) y = Math.max(4, sr.height - h - 4);
      }
      x = Math.max(4, Math.min(x, sr.width - w - 4));
      n.style.left = x + 'px'; n.style.top = y + 'px';
    });
  }

  function btn(text, cls, fn, title) {
    var b = el('button', cls || 'i', text);
    b.type = 'button';
    if (title) { b.title = title; b.setAttribute('aria-label', title); }
    b.addEventListener('mousedown', function (e) { e.preventDefault(); });
    b.addEventListener('click', function (e) { e.stopPropagation(); fn(e, b); });
    return b;
  }

  function sep() { return el('span', 'sep'); }

  function select(options, value, onChange, title) {
    var s = el('select');
    s.title = title || '';
    s.setAttribute('aria-label', title || '');
    options.forEach(function (o) {
      var op = el('option', '', o[1]);
      op.value = String(o[0]);
      s.appendChild(op);
    });
    if (value !== undefined && value !== null) s.value = String(value);
    s.addEventListener('change', function () { onChange(s.value); });
    return s;
  }

  /** A colour button with the brand colours, a #hex box and (optionally) None. */
  function colourButton(label, value, onPick, allowNone) {
    var wrap = el('span', 'wrapb');
    var b = btn('', 'i', function () {
      var open = wrap.querySelector('.pop');
      ov.querySelectorAll('.pop').forEach(function (p) { p.remove(); });
      if (open) return;
      var pop = el('div', 'pop');
      BRAND.forEach(function (c) {
        var s = btn('', 'sw', function () { pop.remove(); onPick(c); }, c);
        s.style.background = c;
        pop.appendChild(s);
      });
      var inp = el('input');
      inp.type = 'text';
      inp.placeholder = '#hex, then Enter';
      inp.value = value || '';
      inp.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        var v = inp.value.trim();
        if (!/^#?[0-9a-f]{6}$/i.test(v) && !/^#?[0-9a-f]{3}$/i.test(v)) { ED.toast('Type a colour like __ACCENT__.', true); return; }
        pop.remove();
        onPick((v[0] === '#' ? v : '#' + v).toUpperCase());
      });
      pop.appendChild(inp);
      if (allowNone) {
        var none = btn('None', 'b', function () { pop.remove(); onPick(''); });
        none.style.gridColumn = '1 / -1';
        pop.appendChild(none);
      }
      wrap.appendChild(pop);
      inp.focus();
    }, label);
    var sw = el('span', 'sw');
    sw.style.background = value || 'transparent';
    if (!value) sw.style.backgroundImage = 'linear-gradient(135deg,#fff 45%,#C5221F 45%,#C5221F 55%,#fff 55%)';
    b.appendChild(document.createTextNode(label + ' '));
    b.appendChild(sw);
    wrap.appendChild(b);
    return wrap;
  }

  function renderAll() {
    clearOverlay();
    if (!editMode || !doc) return;
    if (selRow) {
      var box = put(el('div', 'box'), selRow, 'box');
      if (rowLocked(selRow)) box.appendChild(el('span', 'badge', 'Locked for users'));
      put(rail(), selRow, 'rail');
      put(btn('+', 'plus', function (e, b) { openAddMenu(b); }, 'Add a row below'), selRow, 'plus');
    }
    if (selBlock && !rowPanel) {
      if (selBlock.tagName === 'IMG') put(imagePanel(selBlock), selBlock, 'below');
      else if (isButton(selBlock)) put(buttonBar(selBlock), selBlock, 'above');
      else put(textBar(selBlock), selBlock, 'above');
    } else if (selRow && rowPanel) {
      put(rowBar(selRow), selRow, 'above');
    }
    place();
  }

  function renderHint() {
    hintBar.innerHTML = '';
    var d = el('div', 'ehint' + (table ? '' : ' bad'));
    if (table) {
      d.appendChild(el('span', '', 'Click any text, button or picture to change it. The blue buttons on the left of a row move, copy, lock or delete it, and ⚙ sets its background and spacing. ＋ adds a row. Changes go straight into the code.'));
      d.appendChild(btn('＋ Add a row at the end', 'b', function (e, b) {
        selectRow(table.rows[table.rows.length - 1]);
        var plus = ov.querySelector('.plus');
        if (plus) openAddMenu(plus);
      }));
    } else {
      d.innerHTML = '<b>Rows can’t be found in this code.</b>&nbsp;Text, button and image editing still work. To add, move or delete sections, paste code built for email (with tables), or build it with blocks.';
    }
    hintBar.appendChild(d);
  }

  /* ---------- text ---------- */

  function fontNameOf(stack) {
    var first = String(stack || '').split(',')[0].replace(/["']/g, '').trim().toLowerCase();
    var f = FONTS.filter(function (x) { return x.name.toLowerCase() === first; })[0];
    return f ? f.name : '';
  }

  function textBar(b) {
    var cs = doc.defaultView.getComputedStyle(b);
    var bar = el('div', 'tb');
    var l1 = el('div', 'line');
    var fontOpts = FONTS.map(function (f) { return [f.name, f.name]; });
    var curFont = fontNameOf(cs.fontFamily);
    if (!curFont) fontOpts.unshift(['', '(as in code)']);
    l1.appendChild(select(fontOpts, curFont, function (v) {
      var f = FONTS.filter(function (x) { return x.name === v; })[0];
      if (f) blockStyle('fontFamily', f.stack, 'Font');
      if (f && f.web) ED.toast(f.name + ' shows only where it is installed. Most people see ' + (f.backup || 'the backup font') + '.');
    }, 'Font'));
    var size = Math.round(parseFloat(cs.fontSize) || 14);
    var sizes = SIZES.slice();
    if (sizes.indexOf(size) === -1) { sizes.push(size); sizes.sort(function (a, c) { return a - c; }); }
    l1.appendChild(select(sizes.map(function (n) { return [n, String(n)]; }), size, function (v) { blockStyle('fontSize', v + 'px', 'Text size'); }, 'Text size (px)'));
    l1.appendChild(colourButton('', hex(cs.color), function (c) { textColour(c); }));
    l1.appendChild(sep());
    [['B', 'bold', 'Bold'], ['I', 'italic', 'Italic'], ['U', 'underline', 'Underline']].forEach(function (o) {
      var x = btn(o[0], 'i', function () { format(o[1]); }, o[2]);
      x.style.fontWeight = o[1] === 'bold' ? '700' : '500';
      x.style.fontStyle = o[1] === 'italic' ? 'italic' : 'normal';
      x.style.textDecoration = o[1] === 'underline' ? 'underline' : 'none';
      l1.appendChild(x);
    });
    l1.appendChild(sep());
    var align = cs.textAlign === 'center' ? 'center' : (cs.textAlign === 'right' || cs.textAlign === 'end') ? 'right' : 'left';
    [['left', '⯇≡', 'Align left'], ['center', '≡', 'Centre'], ['right', '≡⯈', 'Align right']].forEach(function (o) {
      var x = btn(o[1], 'i' + (align === o[0] ? ' on' : ''), function () { setAlign(o[0]); }, o[2]);
      l1.appendChild(x);
    });
    l1.appendChild(sep());
    l1.appendChild(btn('🔗 Link', 'i' + (linkOpen ? ' on' : ''), function () { linkOpen = !linkOpen; renderAll(); }, 'Add a link (select the words first)'));
    bar.appendChild(l1);
    if (linkOpen) bar.appendChild(linkLine());
    return bar;
  }

  function linkLine() {
    var l2 = el('div', 'line');
    var inp = el('input');
    inp.type = 'text';
    inp.placeholder = 'https://… or an email address';
    inp.style.width = '220px';
    inp.setAttribute('aria-label', 'Link address');
    l2.appendChild(inp);
    var seg = el('span', 'seg');
    [[false, 'Plain'], [true, 'Bold']].forEach(function (o) {
      var x = btn(o[1], '', function () {
        linkBold = o[0];
        seg.querySelectorAll('button').forEach(function (y, j) { y.setAttribute('aria-pressed', String((j === 1) === linkBold)); });
      }, o[1] + ' link');
      x.setAttribute('aria-pressed', String(linkBold === o[0]));
      seg.appendChild(x);
    });
    l2.appendChild(seg);
    l2.appendChild(btn('Add link', 'b fill', function () { addLink(inp.value); inp.value = ''; }));
    l2.appendChild(btn('Remove link', 'b', function () { format('unlink'); }));
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addLink(inp.value); inp.value = ''; } });
    return l2;
  }

  function format(cmd, value) {
    if (!restore()) { ED.toast('First select the words in the email.', true); return false; }
    doc.execCommand(cmd, false, value);
    remember();
    written(cmd === 'unlink' ? 'Remove link' : 'Formatting', false);
    return true;
  }

  function addLink(raw) {
    var url = cleanUrl(raw);
    if (!url) { ED.toast('Enter a full link, like https://www.example.com, or an email address.', true); return; }
    if (!restore()) { ED.toast('First select the words in the email.', true); return; }
    if (lastRange.collapsed) doc.execCommand('insertHTML', false, '<a href="' + esc(url) + '" data-new="1">' + esc(String(raw).trim()) + '</a>');
    else {
      doc.execCommand('createLink', false, url);
      selBlock.querySelectorAll('a').forEach(function (a) { if (a.getAttribute('href') === url && !a.getAttribute('style')) a.setAttribute('data-new', '1'); });
    }
    selBlock.querySelectorAll('a[data-new]').forEach(function (a) {
      a.setAttribute('target', '_blank');
      a.setAttribute('style', 'color:__ACCENT__;text-decoration:none;' + (linkBold ? 'font-weight:bold;' : ''));
      a.removeAttribute('data-new');
    });
    remember();
    written('Add link', false);
    ED.toast('Link added. It opens in a new tab.');
  }

  /** Font, size, colour of the whole part: set on the part, removed from the words inside it. */
  function blockStyle(prop, value, label) {
    if (!selBlock) return;
    flushTyping();
    selBlock.style[prop] = value;
    if (prop === 'fontSize') selBlock.style.lineHeight = Math.round(parseInt(value, 10) * 1.5) + 'px';
    selBlock.querySelectorAll('*').forEach(function (n) {
      if (prop === 'color' && n.tagName === 'A') return;
      if (n.style && n.style[prop]) n.style[prop] = '';
      if (prop === 'fontSize' && n.style && n.style.lineHeight) n.style.lineHeight = '';
      if (prop === 'fontFamily' && n.tagName === 'FONT') n.removeAttribute('face');
      if (prop === 'fontSize' && n.tagName === 'FONT') n.removeAttribute('size');
      if (prop === 'color' && n.tagName === 'FONT') n.removeAttribute('color');
      if (n.getAttribute('style') === '') n.removeAttribute('style');
    });
    written(label, false);
    renderAll();
  }

  /** Colour: on the selected words if some are selected, otherwise on the whole part. */
  function textColour(c) {
    if (!c) return;
    if (lastRange && !lastRange.collapsed && restore()) {
      doc.execCommand('styleWithCSS', false, true);
      doc.execCommand('foreColor', false, c);
      doc.execCommand('styleWithCSS', false, false);
      remember();
      written('Text colour', false);
      renderAll();
      return;
    }
    blockStyle('color', c, 'Text colour');
  }

  function setAlign(v) {
    if (!selBlock) return;
    flushTyping();
    selBlock.style.textAlign = v;
    if (/^T[DH]$/.test(selBlock.tagName)) selBlock.setAttribute('align', v);
    written('Alignment', false);
    renderAll();
  }

  /* ---------- buttons ---------- */

  function isButton(b) {
    if (!b || b.tagName === 'IMG' || !doc) return false;
    var links = b.querySelectorAll('a');
    if (links.length !== 1) return false;
    var a = links[0];
    var words = a.textContent.trim();
    if (!words || words !== b.textContent.trim() || a.querySelector('img')) return false;
    var win = doc.defaultView;
    if (hex(win.getComputedStyle(a).backgroundColor)) return true;
    var bb = hex(win.getComputedStyle(b).backgroundColor);
    return /^T[DH]$/.test(b.tagName) && Boolean(bb) && bb !== '#FFFFFF';
  }

  /** The cell that paints the button, when the colour is on the cell instead of the link. */
  function buttonCell(b, a) {
    var win = doc.defaultView;
    for (var n = a.parentElement; n && n !== b.parentElement; n = n.parentElement) {
      if (/^T[DH]$/.test(n.tagName) && hex(win.getComputedStyle(n).backgroundColor)) return n;
    }
    return null;
  }

  function buttonBar(b) {
    var a = b.querySelector('a');
    var win = doc.defaultView;
    var cell = buttonCell(b, a);
    var bg = hex(win.getComputedStyle(a).backgroundColor) || (cell ? hex(win.getComputedStyle(cell).backgroundColor) : '');
    var bar = el('div', 'tb');
    var l1 = el('div', 'line');
    l1.appendChild(el('span', 'lab', 'BUTTON'));
    var words = el('input');
    words.type = 'text';
    words.value = a.textContent.trim();
    words.style.width = '140px';
    words.setAttribute('aria-label', 'Button words');
    words.addEventListener('input', function () { a.textContent = words.value || 'Button'; written('Button words', true); });
    l1.appendChild(words);
    var link = el('input');
    link.type = 'text';
    link.value = a.getAttribute('href') || '';
    link.placeholder = 'https://…';
    link.style.width = '170px';
    link.setAttribute('aria-label', 'Button link');
    link.addEventListener('change', function () {
      var url = cleanUrl(link.value);
      if (!url) { ED.toast('Enter a full link, like https://www.example.com', true); return; }
      a.setAttribute('href', url);
      a.setAttribute('target', '_blank');
      written('Button link', false);
    });
    l1.appendChild(link);
    l1.appendChild(sep());
    l1.appendChild(colourButton('Button', bg, function (c) {
      if (!c) return;
      if (hex(win.getComputedStyle(a).backgroundColor) || !cell) a.style.backgroundColor = c;
      if (cell) { cell.style.backgroundColor = c; if (cell.hasAttribute('bgcolor')) cell.setAttribute('bgcolor', c); }
      written('Button colour', false); renderAll();
    }));
    l1.appendChild(colourButton('Text', hex(win.getComputedStyle(a).color), function (c) {
      if (!c) return;
      a.style.color = c;
      written('Button text colour', false); renderAll();
    }));
    var rad = parseInt(win.getComputedStyle(a).borderTopLeftRadius, 10) || (cell ? parseInt(win.getComputedStyle(cell).borderTopLeftRadius, 10) : 0) || 0;
    var near = CORNERS.reduce(function (p, c) { return Math.abs(c[0] - rad) < Math.abs(p[0] - rad) ? c : p; });
    l1.appendChild(select(CORNERS, near[0], function (v) {
      a.style.borderRadius = v + 'px';
      if (cell) cell.style.borderRadius = v + 'px';
      written('Button corners', false);
    }, 'Corners'));
    bar.appendChild(l1);
    return bar;
  }

  /* ---------- images ---------- */

  function imagePanel(img) {
    var src = img.getAttribute('src') || '';
    var inLib = Boolean(LIB) && src.indexOf(LIB) === 0;
    var isPlaceholder = src === PLACEHOLDER;
    var w = Number(img.getAttribute('width')) || Math.round(img.getBoundingClientRect().width) || 600;
    var h = heightBySrc[src] || 0;
    var host = '';
    try { host = new URL(src).hostname; } catch (e) { host = ''; }
    var bar = el('div', 'tb');
    bar.style.width = '520px';
    var l0 = el('div', 'line');
    l0.appendChild(el('span', 'lab', 'IMAGE · ' + w + ' px wide' + (h ? ' × ' + h + ' px' : '') + (isPlaceholder ? ' · choose an image' : inLib ? ' · in your library' : host ? ' · from ' + host : '')));
    bar.appendChild(l0);

    var l1 = el('div', 'line wrap');
    if (!inLib && !isPlaceholder && /^https:\/\//i.test(src)) {
      l1.appendChild(btn('Copy into library', 'b fill', function (e, b) { copyIntoLibrary(img, b); }, 'Copy this picture into your image library'));
    }
    l1.appendChild(btn('Upload', 'b' + (inLib || isPlaceholder ? ' fill' : ''), function () { pickFile(img, w, bar, l1); }));
    l1.appendChild(btn('From library', 'b', function () { library(bar, img, w); }));
    var link = el('input');
    link.type = 'text';
    link.placeholder = 'or paste an image link';
    link.style.flex = '1';
    link.value = isPlaceholder ? '' : src;
    link.setAttribute('aria-label', 'Image link');
    l1.appendChild(link);
    l1.appendChild(btn('Use link', 'b', function () {
      var v = link.value.trim();
      if (!/^https:\/\//i.test(v)) { ED.toast('Image links must start with https://', true); return; }
      setSrc(img, v, 'Image link');
    }));
    bar.appendChild(l1);
    if (window.IMGLIMIT) {
      var lh = el('div', 'line');
      lh.appendChild(window.IMGLIMIT.hint());
      bar.appendChild(lh);
    }

    var l2 = el('div', 'line wrap');
    l2.appendChild(el('span', 'lab', 'HEIGHT'));
    var seg = el('span', 'seg' + (inLib ? '' : ' off'));
    var cur = h ? (shapeOf(w, h) || 'custom') : 'auto';
    HSHAPES.forEach(function (o) {
      var x = btn(o[1], '', function () { cut(img, w, o[2] ? Math.round(w * o[2]) : 0); });
      x.setAttribute('aria-pressed', String(cur === o[0]));
      seg.appendChild(x);
    });
    l2.appendChild(seg);
    var num = el('input');
    num.type = 'number'; num.min = 20; num.max = 2000; num.placeholder = 'px';
    num.style.width = '70px';
    num.disabled = !inLib;
    if (cur === 'custom') num.value = h;
    l2.appendChild(num);
    var set = btn('Set', 'b', function () {
      var v = Math.round(Number(num.value));
      if (!(v >= 20 && v <= 2000)) { ED.toast('Enter a height between 20 and 2000 px.', true); return; }
      cut(img, w, v);
    });
    set.disabled = !inLib;
    l2.appendChild(set);
    if (!inLib) l2.appendChild(el('span', 'note', isPlaceholder ? 'Choose an image first.' : 'Heights work once the image is in your library. Click Copy into library first.'));
    bar.appendChild(l2);

    var l3 = el('div', 'line');
    var alt = el('input');
    alt.type = 'text';
    alt.placeholder = 'Alt text (shown if images are blocked)';
    alt.style.flex = '1';
    alt.value = img.getAttribute('alt') || '';
    alt.addEventListener('change', function () { img.setAttribute('alt', alt.value.trim()); written('Alt text', false); });
    l3.appendChild(alt);
    var a = img.parentElement && img.parentElement.tagName === 'A' ? img.parentElement : null;
    var href = el('input');
    href.type = 'text';
    href.placeholder = 'Link when clicked (optional)';
    href.style.flex = '1';
    href.value = a ? (a.getAttribute('href') || '') : '';
    href.addEventListener('change', function () {
      var url = href.value.trim() ? cleanUrl(href.value) : '';
      if (href.value.trim() && !url) { ED.toast('Enter a full link, like https://www.example.com', true); return; }
      if (a && !url) { a.parentNode.insertBefore(img, a); a.remove(); a = null; }
      else if (a) a.setAttribute('href', url);
      else if (url) {
        var na = doc.createElement('a');
        na.setAttribute('href', url);
        na.setAttribute('target', '_blank');
        na.setAttribute('style', 'text-decoration:none;');
        img.parentNode.insertBefore(na, img);
        na.appendChild(img);
        a = na;
      }
      written('Image link', false);
    });
    l3.appendChild(href);
    bar.appendChild(l3);
    return bar;
  }

  function shapeOf(w, h) {
    for (var i = 1; i < HSHAPES.length; i++) if (Math.round(w * HSHAPES[i][2]) === h) return HSHAPES[i][0];
    return null;
  }

  function setSrc(img, url, label, h) {
    if (h) heightBySrc[url] = h;
    img.setAttribute('src', url);
    if (/height\s*:\s*\d/i.test(img.getAttribute('style') || '')) img.style.height = 'auto';
    img.removeAttribute('height');
    written(label, false);
    renderAll();
  }

  function cut(img, w, h) {
    var src = img.getAttribute('src');
    var source = origBySrc[src] || src;
    if (!h) { setSrc(img, source, 'Image height'); return; }
    ED.toast('Cutting the image to ' + w + ' × ' + h + '…');
    ED.post('/editor/crop', { url: source, width: w, height: h }).then(function (j) {
      origBySrc[j.url] = source;
      setSrc(img, j.url, 'Image height', h);
      if (j.warning) ED.toast(j.warning, true);
    }).catch(function (e) { ED.toast(e.message, true); });
  }

  function copyIntoLibrary(img, button) {
    var src = img.getAttribute('src');
    button.disabled = true;
    button.textContent = 'Copying…';
    ED.post('/editor/import', { url: src }).then(function (j) {
      setSrc(img, j.url, 'Copy into library');
      ED.toast(j.already ? 'This image was already in the library. The email now uses the library copy.' : 'Copied into your image library. Heights work now.');
    }).catch(function (e) {
      button.disabled = false;
      button.textContent = 'Copy into library';
      var bar = button.closest('.tb');
      if (e.data && e.data.tooBig && window.IMGLIMIT && bar) {
        window.IMGLIMIT.show(bar, e.data.size || 0, button.closest('.line'), 'Download the picture, reduce it, then click Upload here.');
        place();
      } else ED.toast(e.message, true);
    });
  }

  var fileInput = el('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/jpeg,image/png,image/webp,image/gif';
  fileInput.hidden = true;
  document.body.appendChild(fileInput);
  var pending = null;

  function pickFile(img, w, bar, line) { pending = { img: img, w: w, bar: bar, line: line }; fileInput.click(); }

  fileInput.addEventListener('change', function () {
    var f = fileInput.files[0];
    fileInput.value = '';
    if (!f || !pending) return;
    var t = pending;
    pending = null;
    if (window.IMGLIMIT && t.bar) window.IMGLIMIT.clear(t.bar);
    if (f.size > ED.maxImage) {
      if (window.IMGLIMIT && t.bar && t.bar.isConnected) { window.IMGLIMIT.show(t.bar, f.size, t.line); place(); }
      else ED.toast('This image is over 1 MB. Make it smaller and try again.', true);
      return;
    }
    var h = heightBySrc[t.img.getAttribute('src')] || 0;
    var body = new FormData();
    body.append('width', String(t.w));
    body.append('height', String(h));
    body.append('image', f);
    ED.toast('Uploading…');
    fetch('/editor/upload?ticket=' + encodeURIComponent(ED.ticket), { method: 'POST', body: body })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (j) { if (!res.ok) throw new Error(j.error || 'Upload failed. Try again.'); return j; }); })
      .then(function (j) {
        origBySrc[j.url] = j.orig || j.url;
        setSrc(t.img, j.url, 'Upload image', h);
        ED.toast(j.warning || 'Image replaced. The original is also saved in the image library.', Boolean(j.warning));
      })
      .catch(function (e) { ED.toast(e.message, true); });
  });

  function library(bar, img, w) {
    var old = bar.querySelector('.libgrid');
    if (old) { old.remove(); place(); return; }
    var grid = el('div', 'libgrid');
    grid.appendChild(el('span', 'note', 'Loading the image library…'));
    bar.appendChild(grid);
    place();
    fetch('/editor/images?ticket=' + encodeURIComponent(ED.ticket))
      .then(function (res) { return res.json(); })
      .then(function (j) {
        grid.innerHTML = '';
        (j.images || []).slice(0, 36).forEach(function (im) {
          var b = btn('', '', function () {
            var h = heightBySrc[img.getAttribute('src')] || 0;
            if (h) { origBySrc[img.getAttribute('src')] = im.url; img.setAttribute('src', im.url); cut(img, w, h); }
            else setSrc(img, im.url, 'Image from library');
          }, im.name);
          var i = el('img');
          i.src = im.url; i.alt = im.name; i.loading = 'lazy';
          b.appendChild(i);
          grid.appendChild(b);
        });
        if (!grid.children.length) grid.appendChild(el('span', 'note', 'No images yet. Use Upload.'));
        place();
      })
      .catch(function () { grid.innerHTML = ''; grid.appendChild(el('span', 'note', 'The library could not be loaded.')); });
  }

  /* ---------- rows ---------- */

  function partsIn(tr) { return Array.prototype.map.call(tr.querySelectorAll('[data-b]'), function (n) { return n.getAttribute('data-b'); }); }

  function rowLocked(tr) {
    var ids = partsIn(tr);
    var locks = H.getLocks();
    return ids.length > 0 && ids.every(function (id) { return locks.indexOf(id) !== -1; });
  }

  function rail() {
    var r = el('div', 'rail');
    var grip = btn('⠿', 'grip', function () {}, 'Drag to move this row');
    grip.addEventListener('mousedown', function (e) { if (e.button === 0) startDrag(e); });
    r.appendChild(grip);
    r.appendChild(btn('↑', '', function () { moveRow(-1); }, 'Move up'));
    r.appendChild(btn('↓', '', function () { moveRow(1); }, 'Move down'));
    r.appendChild(btn('⧉', '', copyRow, 'Copy this row'));
    var locked = rowLocked(selRow);
    r.appendChild(btn('🔒', locked ? 'on' : '', toggleRowLock, locked ? 'Locked for users. Click to let users change this row.' : 'Lock this row for users'));
    r.appendChild(btn('⚙', rowPanel ? 'on' : '', function () { selectRow(selRow); }, 'Row background and spacing'));
    r.appendChild(btn('🗑', 'del', deleteRow, 'Delete this row'));
    return r;
  }

  function cellsOf(tr) { return Array.prototype.slice.call(tr.cells); }

  function rowBar(tr) {
    var win = doc.defaultView;
    var cells = cellsOf(tr);
    var c0 = cells[0];
    var bar = el('div', 'tb');
    var l1 = el('div', 'line');
    l1.appendChild(el('span', 'lab', 'ROW'));
    var bg = c0 ? hex(win.getComputedStyle(c0).backgroundColor) : '';
    l1.appendChild(colourButton('Background', bg, function (c) {
      cells.forEach(function (td) {
        td.style.backgroundColor = c || '';
        if (td.hasAttribute('bgcolor')) { if (c) td.setAttribute('bgcolor', c); else td.removeAttribute('bgcolor'); }
        if (!c && /background\s*:/i.test(td.getAttribute('style') || '')) td.style.background = '';
      });
      written('Row background', false); renderAll();
    }, true));
    if (cells.length === 1) {
      l1.appendChild(sep());
      var cs = win.getComputedStyle(c0);
      [['paddingTop', 'Top'], ['paddingBottom', 'Bottom'], ['paddingLeft', 'Sides']].forEach(function (o) {
        var v = Math.round(parseFloat(cs[o[0]]) || 0);
        var opts = SPACES.slice();
        if (opts.indexOf(v) === -1) { opts.push(v); opts.sort(function (a, b) { return a - b; }); }
        l1.appendChild(el('span', 'lab', o[1].toUpperCase()));
        l1.appendChild(select(opts.map(function (n) { return [n, n + ' px']; }), v, function (val) {
          if (o[0] === 'paddingLeft') { c0.style.paddingLeft = val + 'px'; c0.style.paddingRight = val + 'px'; }
          else c0.style[o[0]] = val + 'px';
          written('Row spacing', false); place();
        }, o[1] + ' spacing'));
      });
    } else {
      l1.appendChild(el('span', 'note', 'Spacing is set inside each column of this row.'));
    }
    bar.appendChild(l1);
    return bar;
  }

  function moveRow(d) {
    var i = rowIndex(selRow);
    var j = i + d;
    if (i < 0 || j < 0 || j >= table.rows.length) return;
    structural('Move row', function () {
      var other = table.rows[j];
      if (d < 0) other.parentNode.insertBefore(selRow, other);
      else other.parentNode.insertBefore(selRow, other.nextSibling);
      return { row: selRow, block: selBlock };
    });
  }

  function copyRow() {
    structural('Copy row', function () {
      var copy = selRow.cloneNode(true);
      copy.querySelectorAll('[contenteditable]').forEach(function (n) { n.removeAttribute('contenteditable'); n.removeAttribute('spellcheck'); });
      copy.querySelectorAll('.x-bsel').forEach(function (n) { n.classList.remove('x-bsel'); if (!n.getAttribute('class')) n.removeAttribute('class'); });
      selRow.parentNode.insertBefore(copy, selRow.nextSibling);
      return { row: copy };
    });
    ED.toast('Row copied. The copy is selected.');
  }

  function deleteRow() {
    if (table.rows.length <= 1) { ED.toast('The email needs at least one row.', true); return; }
    var i = rowIndex(selRow);
    structural('Delete row', function () {
      selRow.parentNode.removeChild(selRow);
      selBlock = null;
      var next = table.rows[Math.min(i, table.rows.length - 1)];
      return { row: next };
    });
    ED.toast('Row deleted. Undo brings it back.');
  }

  function toggleRowLock() {
    var ids = partsIn(selRow);
    if (!ids.length) { ED.toast('This row has no text or pictures to lock.'); return; }
    var locks = H.getLocks();
    var all = ids.every(function (id) { return locks.indexOf(id) !== -1; });
    if (all) locks = locks.filter(function (id) { return ids.indexOf(id) === -1; });
    else ids.forEach(function (id) { if (locks.indexOf(id) === -1) locks.push(id); });
    H.setLocks(locks);
    commit(all ? 'Unlock row' : 'Lock row');
    ED.toast(all ? 'Users can change this row with Customise.' : 'Row locked: users can’t change it with Customise.');
    renderAll();
  }

  /* ---------- drag a row ---------- */

  function startDrag(e0) {
    e0.preventDefault();
    if (!table || !selRow) return;
    flushTyping();
    var from = rowIndex(selRow);
    var cover = el('div', 'cover');
    stage.appendChild(cover);
    var line = el('div', 'dl');
    ov.appendChild(line);
    selRow.style.opacity = '0.35';
    var target = from;
    function at(clientY) {
      var fr = frame.getBoundingClientRect();
      var sr = stage.getBoundingClientRect();
      var y = clientY - fr.top;
      var rows = Array.prototype.slice.call(table.rows);
      var idx = rows.length;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i].getBoundingClientRect();
        if (y < r.top + r.height / 2) { idx = i; break; }
      }
      target = idx;
      var ref = idx < rows.length ? rows[idx].getBoundingClientRect().top : rows[rows.length - 1].getBoundingClientRect().bottom;
      var tb = table.getBoundingClientRect();
      line.style.left = (fr.left - sr.left + tb.left) + 'px';
      line.style.width = tb.width + 'px';
      line.style.top = (fr.top - sr.top + ref - 2) + 'px';
      /* scroll the preview when dragging near its edges */
      var win = doc.defaultView;
      if (y < 40) win.scrollBy(0, -18); else if (y > fr.height - 40) win.scrollBy(0, 18);
    }
    function move(e) { e.preventDefault(); at(e.clientY); }
    function up() {
      document.removeEventListener('mousemove', move, true);
      document.removeEventListener('mouseup', up, true);
      cover.remove();
      line.remove();
      selRow.style.opacity = '';
      if (!selRow.getAttribute('style')) selRow.removeAttribute('style');
      var to = target > from ? target - 1 : target;
      if (to === from) { place(); return; }
      structural('Drag row', function () {
        var rows = Array.prototype.slice.call(table.rows);
        var ref = rows[target];
        if (ref) ref.parentNode.insertBefore(selRow, ref);
        else rows[rows.length - 1].parentNode.insertBefore(selRow, rows[rows.length - 1].nextSibling);
        return { row: selRow };
      });
    }
    document.addEventListener('mousemove', move, true);
    document.addEventListener('mouseup', up, true);
    at(e0.clientY);
  }

  /* ---------- add a row ---------- */

  var KINDS = [
    ['text', 'Text'], ['image', 'Image'], ['imageText', 'Image + text'], ['button', 'Button'],
    ['cols', 'Columns'], ['divider', 'Divider'], ['space', 'Space'], ['header', 'Header (top)'], ['footer', 'Footer (bottom)']
  ];
  var KIND_NAME = { text: 'Text', image: 'Image', imageText: 'Image + text', button: 'Button', cols: 'Columns', divider: 'Divider', space: 'Space', header: 'Header', footer: 'Footer' };

  function openAddMenu(anchor) {
    var old = ov.querySelector('.menu');
    if (old) { old.remove(); items = items.filter(function (it) { return it.node !== old; }); return; }
    var m = el('div', 'menu');
    m.appendChild(el('div', 't', 'ADD A ROW BELOW'));
    KINDS.forEach(function (k) {
      var b = btn('', '', function () { addRow(k[0]); });
      b.appendChild(el('i'));
      b.appendChild(document.createTextNode(k[1]));
      m.appendChild(b);
    });
    var cp = btn('⧉ Copy this row (keeps your design exactly)', 'cp', copyRow);
    m.appendChild(cp);
    m.appendChild(el('small', '', 'New rows use your email’s font and width. Header goes to the top, footer to the bottom.'));
    put(m, anchor, 'below');
    place();
  }

  /** The look of the email around the selected row: font, text colour, width, side spacing, columns. */
  function looks() {
    var win = doc.defaultView;
    /* the email's normal body text: the first plain-sized, dark-on-light text that is not a button */
    var texts = Array.prototype.slice.call(root.querySelectorAll('[data-b^="t"]'));
    var bodyLike = function (n) {
      var c = win.getComputedStyle(n);
      var size = parseFloat(c.fontSize) || 0;
      var col = hex(c.color);
      return size >= 11 && size <= 18 && col !== '#FFFFFF' && !/^H[1-6]$/.test(n.tagName) && !isButton(n);
    };
    var sample = texts.filter(function (n) { return selRow && selRow.contains(n) && bodyLike(n); })[0] ||
      texts.filter(bodyLike)[0] || texts[0];
    var cs = sample ? win.getComputedStyle(sample) : null;
    var font = cs ? cs.fontFamily.replace(/"/g, "'") : 'Arial, Helvetica, sans-serif';
    var colour = cs ? (hex(cs.color) || '#1F1F1F') : '#1F1F1F';
    if (colour === '#FFFFFF') colour = '#1F1F1F';
    var width = parseInt(table.getAttribute('width'), 10) || parseInt(table.style.maxWidth, 10) || parseInt(table.style.width, 10) || 600;
    if (!(width >= 300 && width <= 900)) width = 600;
    var side = 32;
    if (selRow && selRow.cells.length === 1) {
      var p = Math.round(parseFloat(win.getComputedStyle(selRow.cells[0]).paddingLeft) || 0);
      if (p >= 12 && p <= 64) side = p;
    }
    var span = 1;
    Array.prototype.forEach.call(table.rows, function (r) {
      var n = 0;
      Array.prototype.forEach.call(r.cells, function (c) { n += c.colSpan || 1; });
      span = Math.max(span, n);
    });
    return { font: font, colour: colour, width: width, side: side, span: span };
  }

  function rowHtml(kind, L) {
    var td = function (style, inner, extra) {
      return '<tr><td' + (L.span > 1 ? ' colspan="' + L.span + '"' : '') + (extra || '') + ' style="' + style + '">' + inner + '</td></tr>';
    };
    var text = function (words, size) {
      return '<div style="font-family:' + L.font + ';font-size:' + (size || 15) + 'px;line-height:' + Math.round((size || 15) * 1.6) + 'px;color:' + L.colour + ';">' + words + '</div>';
    };
    var inner = L.width - 2 * L.side;
    var pad = 'padding:16px ' + L.side + 'px;';
    switch (kind) {
      case 'text':
        return td(pad, text('Write your text here. Click it to type.'));
      case 'image':
        return td(pad, '<img src="' + PLACEHOLDER + '" alt="" width="' + inner + '" style="display:block;width:100%;max-width:' + inner + 'px;height:auto;border:0;">', ' align="center"');
      case 'imageText':
        return td(pad, '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
          '<td width="200" valign="top" style="width:200px;"><img src="' + PLACEHOLDER + '" alt="" width="200" style="display:block;width:100%;max-width:200px;height:auto;border:0;"></td>' +
          '<td valign="top" style="padding-left:20px;">' + text('<b>A short heading</b><br>Write a few words next to the picture. Click to type.') + '</td></tr></table>');
      case 'button':
        return td('padding:12px ' + L.side + 'px 20px ' + L.side + 'px;text-align:center;',
          '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;"><tr><td style="background:__ACCENT__;border-radius:6px;">' +
          '<a href="__SITE_JS__" target="_blank" style="display:inline-block;padding:12px 28px;font-family:' + L.font + ';font-size:15px;font-weight:bold;line-height:20px;color:#FFFFFF;text-decoration:none;border-radius:6px;">Learn more</a></td></tr></table>', ' align="center"');
      case 'cols':
        var half = Math.floor((inner - 20) / 2);
        return td(pad, '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
          '<td width="' + half + '" valign="top" style="width:50%;padding-right:10px;">' + text('Left column. Click to type.') + '</td>' +
          '<td width="' + half + '" valign="top" style="width:50%;padding-left:10px;">' + text('Right column. Click to type.') + '</td></tr></table>');
      case 'divider':
        return td('padding:12px ' + L.side + 'px;', '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid #DADCE0;font-size:1px;line-height:1px;">&nbsp;</td></tr></table>');
      case 'space':
        return td('height:24px;font-size:1px;line-height:1px;', '&nbsp;');
      case 'header':
        return td('background:__INK__;padding:22px ' + L.side + 'px;', '<div style="font-family:' + L.font + ';font-size:22px;line-height:28px;font-weight:bold;color:#FFFFFF;">__BRAND_JS__</div>');
      case 'footer':
        return td('background:__SOFT__;padding:20px ' + L.side + 'px;text-align:center;',
          '<div style="font-family:' + L.font + ';font-size:12px;line-height:18px;color:__INK__;">© __BRAND_JS__. All rights reserved.<br>' +
          '<a href="__SITE_JS__" target="_blank" style="color:__INK__;text-decoration:none;font-weight:bold;">__BRAND_JS__</a></div>', ' align="center"');
      default:
        return '';
    }
  }

  function addRow(kind) {
    if (!table) return;
    var L = looks();
    var holder = doc.createElement('tbody');
    holder.innerHTML = rowHtml(kind, L);
    var tr = holder.firstElementChild;
    if (!tr) return;
    structural('Add ' + KIND_NAME[kind] + ' row', function () {
      var rows = table.rows;
      if (kind === 'header') rows[0].parentNode.insertBefore(tr, rows[0]);
      else if (kind === 'footer' || !selRow) rows[rows.length - 1].parentNode.insertBefore(tr, rows[rows.length - 1].nextSibling);
      else selRow.parentNode.insertBefore(tr, selRow.nextSibling);
      return { row: tr };
    });
    var first = tr.querySelector('[data-b]');
    if (first) selectBlock(first, tr);
    try { tr.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* ignore */ }
    setTimeout(place, 350);
    ED.toast(kind === 'header' ? 'Header added at the top. Click its text to change it.' : kind === 'footer' ? 'Footer added at the bottom.' : KIND_NAME[kind] + ' row added.');
  }

  /* close open colour boxes and menus when clicking elsewhere on the page */
  document.addEventListener('mousedown', function (e) {
    if (!editMode || ov.contains(e.target)) return;
    ov.querySelectorAll('.pop').forEach(function (p) { p.remove(); });
  });

  urButtons();
})();
