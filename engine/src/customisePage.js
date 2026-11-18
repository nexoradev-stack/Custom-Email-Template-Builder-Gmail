'use strict';

const customiseCss = require('fs').readFileSync(require('path').join(__dirname, 'styles', 'customise.css'), 'utf8');

/**
 * Customise window for users: change the photos and text the admin allowed,
 * block by block, without breaking the layout. Photos are cut to the exact
 * size of the box they replace. The result is saved for this user only;
 * the template in the gallery never changes.
 */

const safeJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
/* The 1 MB photo limit with the red "Reduce it here" box. */
const { CLIENT: imgLimitJs } = require('./imageLimit');

function customisePage({ ticket, name, category, html, blocks, locks }) {
  const boot = { ticket: String(ticket), name, category, html, blocks, locks: locks || [] };
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Customise · ${String(name).replace(/[<>&"]/g, '')} · __APP__</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap">
<style>
${customiseCss}
</style>
</head>
<body>
  <div class="band"><div class="logo"><img src="__LOGO__" alt="__BRAND__"></div><h1>TEMPLATE GALLERY</h1><div></div></div>
  <div class="bar">
    <div><div class="nm" id="name"></div><div class="meta">Customise your copy · the template in the gallery stays unchanged</div></div>
    <span class="grow"></span>
    <button class="btn" id="reset" type="button">Start over</button>
    <button class="btn fill" id="save" type="button">Use in my email</button>
  </div>
  <div class="main">
    <div class="stage"><iframe id="frame" title="Your email" sandbox="allow-same-origin"></iframe></div>
    <aside class="side" aria-label="Change a block">
      <div id="panel"></div>
      <div class="line"></div>
      <h2>WHAT YOU CAN CHANGE</h2>
      <div class="list" id="list"></div>
    </aside>
  </div>
  <input class="sr" type="file" id="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label="Choose a photo">
  <div class="done" id="done" role="dialog" aria-modal="true" aria-labelledby="doneTitle">
    <div class="box">
      <h3 id="doneTitle">Your email is ready</h3>
      <p>Go back to the Gmail tab and click <b>Add to email</b> in the __APP__ panel.</p>
      <button class="btn fill" id="close" type="button">Close this tab</button>
    </div>
  </div>

<script>
${imgLimitJs}
</script>
<script>
(function () {
  var BOOT = ${safeJson(boot)};
  var $ = function (id) { return document.getElementById(id); };
  var frame = $('frame'), panel = $('panel'), list = $('list'), file = $('file');
  var locked = {}; BOOT.locks.forEach(function (id) { locked[id] = true; });
  var info = {}; BOOT.blocks.forEach(function (b) { info[b.id] = b; });
  var original = {};
  var doc = null, selected = null, fit = 'cover', busy = false, saved = false;
  $('name').textContent = BOOT.name;

  var EDIT_CSS = '[data-b]{transition:outline-color .12s}' +
    '[data-b].can{outline:2px dashed transparent;outline-offset:-2px;cursor:pointer}' +
    '[data-b].can:hover{outline-color:__ACCENT_LIGHT__}' +
    '[data-b].sel{outline:2px solid __ACCENT__ !important;outline-offset:-2px}' +
    '[data-b][contenteditable="true"]{cursor:text;caret-color:__ACCENT__}' +
    '[data-b].lock{cursor:not-allowed}' +
    'img[data-b].busy{opacity:.45}';

  function load() {
    frame.srcdoc = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#F1F3F4}#em{max-width:800px;margin:18px auto}' + EDIT_CSS + '</style></head><body><div id="em">' + BOOT.html + '</div></body></html>';
  }

  frame.addEventListener('load', function () {
    doc = frame.contentDocument;
    selected = null;
    doc.querySelectorAll('[data-b]').forEach(function (el) {
      var id = el.getAttribute('data-b');
      if (!(id in original)) original[id] = el.tagName === 'IMG' ? el.getAttribute('src') : el.innerHTML;
      el.classList.add(locked[id] ? 'lock' : 'can');
    });
    doc.addEventListener('click', onClick, true);
    /* Nothing can be dragged around inside the email: a picture dropped into text would break the layout. */
    doc.addEventListener('dragstart', function (e) { e.preventDefault(); }, true);
    doc.addEventListener('selectionchange', rememberSelection);
    doc.addEventListener('mouseup', rememberSelection);
    doc.addEventListener('keyup', rememberSelection);
    doc.addEventListener('drop', function (e) { e.preventDefault(); }, true);
    doc.addEventListener('input', function () { renderList(); });
    doc.addEventListener('paste', function (e) {
      if (!e.target.closest || !e.target.closest('[contenteditable="true"]')) return;
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData('text/plain');
      doc.execCommand('insertText', false, text);
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.closest && e.target.closest('[contenteditable="true"]')) {
        e.preventDefault();
        doc.execCommand('insertLineBreak');
      }
    });
    renderPanel();
    renderList();
  });

  function blockEl(id) { return doc && doc.querySelector('[data-b="' + id + '"]'); }

  function changed(id) {
    var el = blockEl(id);
    if (!el) return false;
    return (el.tagName === 'IMG' ? el.getAttribute('src') : el.innerHTML) !== original[id];
  }

  function onClick(e) {
    var a = e.target.closest && e.target.closest('a');
    if (a) e.preventDefault();
    var el = e.target.closest && e.target.closest('[data-b]');
    if (!el) return;
    select(el.getAttribute('data-b'));
  }

  function select(id) {
    if (id !== selected) lastRange = null;
    if (selected) {
      var prev = blockEl(selected);
      if (prev) { prev.classList.remove('sel'); prev.removeAttribute('contenteditable'); }
    }
    selected = id;
    var el = blockEl(id);
    if (el) {
      el.classList.add('sel');
      if (!locked[id] && el.tagName !== 'IMG') {
        el.setAttribute('contenteditable', 'true');
        el.setAttribute('spellcheck', 'true');
        el.focus();
      }
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    renderPanel();
    renderList();
  }

  function message(kind, text) {
    var m = document.createElement('div');
    m.className = 'msg ' + kind;
    m.textContent = text;
    return m;
  }

  function button(text, cls, fn) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn sm ' + (cls || '');
    b.textContent = text;
    b.addEventListener('click', fn);
    return b;
  }

  function renderPanel() {
    panel.innerHTML = '';
    var h = document.createElement('h2');
    var big = document.createElement('div');
    big.className = 'big';
    panel.appendChild(h);
    panel.appendChild(big);
    if (!selected) {
      h.textContent = 'HOW IT WORKS';
      big.textContent = 'Click a part of the email';
      var p = document.createElement('p');
      p.textContent = 'Parts with a blue outline can be changed. Photos are cut to the same size automatically, so the layout never moves. Text keeps its font and size.';
      panel.appendChild(p);
      return;
    }
    var b = info[selected] || { type: 'text' };
    var el = blockEl(selected);
    if (locked[selected]) {
      h.textContent = b.type === 'image' ? 'IMAGE' : 'TEXT';
      big.textContent = 'Locked by the admin';
      panel.appendChild(message('info', 'This part stays the same in every email. Contact a template admin if it needs to change.'));
      return;
    }
    if (b.type === 'image') {
      var r = el.getBoundingClientRect();
      h.textContent = 'IMAGE';
      big.textContent = 'Box ' + Math.round(r.width) + ' × ' + Math.round(r.height);
      var p2 = document.createElement('p');
      p2.textContent = 'Choose a photo. It is fitted to this box automatically, so nothing around it moves.';
      panel.appendChild(p2);
      var stack = document.createElement('div');
      stack.className = 'stack';
      stack.appendChild(button(busy ? 'Uploading…' : 'Choose photo', 'fill', function () { if (!busy) file.click(); }));
      if (changed(selected)) stack.appendChild(button('Back to original photo', '', function () { el.setAttribute('src', original[selected]); renderPanel(); renderList(); }));
      panel.appendChild(stack);
      var hint = document.createElement('p');
      hint.style.fontSize = '12px';
      hint.style.color = '#5F6368';
      hint.textContent = 'JPG, PNG, WebP or GIF · up to 1 MB.';
      panel.appendChild(hint);
    } else {
      h.textContent = 'TEXT';
      big.textContent = 'Type to change it';
      var p3 = document.createElement('p');
      p3.textContent = 'Click inside the outlined text in the email and type. Font, size and spacing stay as designed. Press Enter for a new line.';
      panel.appendChild(p3);
      panel.appendChild(textTools());
      if (changed(selected)) panel.appendChild(button('Undo changes to this text', '', function () { el.innerHTML = original[selected]; renderPanel(); renderList(); }));
    }
  }

  /* ---------- bold, italic, underline and links ---------- */

  var lastRange = null;
  var linkBold = false;

  function rememberSelection() {
    if (!doc || !selected) return;
    var sel = doc.getSelection();
    if (!sel || !sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    var host = range.commonAncestorContainer;
    if (host.nodeType === 3) host = host.parentNode;
    if (host && host.closest && host.closest('[data-b="' + selected + '"]')) lastRange = range.cloneRange();
  }

  function restoreSelection() {
    var el = blockEl(selected);
    if (!el || !lastRange) return false;
    el.focus();
    var sel = doc.getSelection();
    sel.removeAllRanges();
    sel.addRange(lastRange);
    return true;
  }

  function styleLinks() {
    var el = blockEl(selected);
    if (!el) return;
    el.querySelectorAll('a').forEach(function (a) {
      if (a.getAttribute('data-new') !== '1') return;
      a.removeAttribute('data-new');
      a.setAttribute('target', '_blank');
      a.setAttribute('style', 'color:__ACCENT__;text-decoration:none;' + (linkBold ? 'font-weight:bold;' : ''));
    });
  }

  function cleanUrl(v) {
    var u = String(v || '').trim();
    if (!u) return '';
    if (/^mailto:/i.test(u) || /^https?:\\/\\//i.test(u)) return u;
    if (/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(u)) return 'mailto:' + u;
    if (/^[a-z0-9.-]+\\.[a-z]{2,}(\\/.*)?$/i.test(u)) return 'https://' + u;
    return '';
  }

  function format(cmd, value) {
    if (!restoreSelection()) { panel.prepend(message('err', 'First select the words in the email.')); return false; }
    doc.execCommand(cmd, false, value);
    rememberSelection();
    renderList();
    return true;
  }

  function textTools() {
    var box = document.createElement('div');
    box.className = 'stack';
    var bar = document.createElement('div');
    bar.className = 'fmt';
    [['B', 'bold', 'Bold'], ['I', 'italic', 'Italic'], ['U', 'underline', 'Underline']].forEach(function (o) {
      var x = button(o[0], 'fmtb fmt-' + o[1], function () { format(o[1]); });
      x.title = o[2];
      x.setAttribute('aria-label', o[2]);
      x.addEventListener('mousedown', function (e) { e.preventDefault(); });
      bar.appendChild(x);
    });
    var un = button('Remove link', 'fmtb', function () { format('unlink'); });
    un.addEventListener('mousedown', function (e) { e.preventDefault(); });
    bar.appendChild(un);
    box.appendChild(bar);

    var row = document.createElement('div');
    row.className = 'linkrow';
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = 'https://… or an email address';
    inp.setAttribute('aria-label', 'Link address');
    var add = button('Add link', '', function () {
      var url = cleanUrl(inp.value);
      if (!url) { panel.prepend(message('err', 'Enter a full link, like https://www.example.com, or an email address.')); return; }
      if (!restoreSelection()) { panel.prepend(message('err', 'First select the words in the email.')); return; }
      if (lastRange.collapsed) doc.execCommand('insertHTML', false, '<a href="' + url.replace(/"/g, '&quot;') + '" data-new="1">' + inp.value.trim().replace(/</g, '&lt;') + '</a>');
      else {
        doc.execCommand('createLink', false, url);
        blockEl(selected).querySelectorAll('a').forEach(function (a) { if (a.getAttribute('href') === url && !a.getAttribute('style')) a.setAttribute('data-new', '1'); });
      }
      styleLinks();
      rememberSelection();
      renderList();
      inp.value = '';
      panel.prepend(message('ok', 'Link added. It opens in a new tab.'));
    });
    add.addEventListener('mousedown', function (e) { e.preventDefault(); });
    row.appendChild(inp);
    row.appendChild(add);
    box.appendChild(row);

    var ls = document.createElement('div');
    ls.className = 'seg';
    [[false, 'Plain link'], [true, 'Bold link']].forEach(function (o) {
      var x = document.createElement('button');
      x.type = 'button';
      x.textContent = o[1];
      x.setAttribute('aria-pressed', String(linkBold === o[0]));
      x.addEventListener('mousedown', function (e) { e.preventDefault(); });
      x.addEventListener('click', function () {
        linkBold = o[0];
        ls.querySelectorAll('button').forEach(function (y, i) { y.setAttribute('aria-pressed', String((i === 1) === linkBold)); });
      });
      ls.appendChild(x);
    });
    box.appendChild(ls);
    var hint = document.createElement('p');
    hint.style.cssText = 'font-size:12px;color:#5F6368;margin:0';
    hint.textContent = 'Select words in the email first. Links open in a new tab.';
    box.appendChild(hint);
    return box;
  }

  function renderList() {
    list.innerHTML = '';
    var any = false;
    BOOT.blocks.forEach(function (b) {
      var x = document.createElement('button');
      x.type = 'button';
      var s = document.createElement('span');
      s.textContent = (b.type === 'image' ? 'Photo · ' : 'Text · ') + b.label;
      var em = document.createElement('em');
      if (locked[b.id]) { em.textContent = 'locked'; x.disabled = true; }
      else if (changed(b.id)) { em.textContent = 'changed'; em.className = 'ch'; any = true; }
      else em.textContent = 'original';
      x.appendChild(s); x.appendChild(em);
      if (!locked[b.id]) x.addEventListener('click', function () { select(b.id); });
      list.appendChild(x);
    });
    if (!BOOT.blocks.some(function (b) { return !locked[b.id]; })) {
      list.appendChild(message('info', 'The admin has locked every part of this template. Go back to Gmail and use Add to email.'));
    }
    $('save').textContent = any ? 'Use in my email' : 'Use in my email';
  }

  file.addEventListener('change', function () {
    var f = file.files[0];
    file.value = '';
    if (!f || !selected) return;
    var id = selected;
    var el = blockEl(id);
    if (!/^image\\/(jpeg|png|webp|gif)$/.test(f.type)) { panel.prepend(message('err', 'Choose a JPG, PNG, WebP or GIF photo.')); return; }
    if (window.IMGLIMIT) window.IMGLIMIT.clear(panel);
    if (f.size > IMGLIMIT.max) { IMGLIMIT.show(panel, f.size, panel.querySelector('.stack'), 'Reduce it, download the smaller copy, then click Choose photo again.'); return; }
    var r = el.getBoundingClientRect();
    var body = new FormData();
    body.append('w', String(Math.max(1, Math.round(r.width))));
    body.append('h', String(Math.max(1, Math.round(r.height))));
    body.append('fit', 'cover');
    body.append('image', f);
    busy = true; el.classList.add('busy'); renderPanel();
    fetch('/customise/image?ticket=' + encodeURIComponent(BOOT.ticket), { method: 'POST', body: body })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (j) { if (!res.ok) { var er = new Error(j.error || 'Upload failed. Try again.'); er.data = j; throw er; } return j; }); })
      .then(function (j) {
        el.setAttribute('src', j.url);
        busy = false; el.classList.remove('busy');
        renderPanel(); renderList();
        panel.prepend(message(j.warning ? 'err' : 'ok', j.warning || 'Photo changed.'));
      })
      .catch(function (e) {
        busy = false; el.classList.remove('busy');
        renderPanel();
        if (e.data && e.data.tooBig) IMGLIMIT.show(panel, e.data.size || f.size, panel.querySelector('.stack'), 'Reduce it, download the smaller copy, then click Choose photo again.');
        else panel.prepend(message('err', e.message));
      });
  });

  $('reset').addEventListener('click', function () {
    if (!confirm('Undo all your changes and start from the template again?')) return;
    original = {};
    load();
  });

  $('save').addEventListener('click', function () {
    if (busy || !doc) return;
    if (selected) select(selected);
    doc.querySelectorAll('[contenteditable]').forEach(function (el) { el.removeAttribute('contenteditable'); el.removeAttribute('spellcheck'); });
    doc.querySelectorAll('.can,.lock,.sel,.busy').forEach(function (el) { el.classList.remove('can', 'lock', 'sel', 'busy'); });
    var changes = BOOT.blocks.filter(function (b) { return changed(b.id); }).map(function (b) { return b.id; });
    var html = doc.getElementById('em').innerHTML;
    var btn = $('save');
    btn.disabled = true; btn.textContent = 'Saving…';
    fetch('/customise/save?ticket=' + encodeURIComponent(BOOT.ticket), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: html, changes: changes })
    }).then(function (res) { return res.json().catch(function () { return {}; }).then(function (j) { if (!res.ok) throw new Error(j.error || 'Could not save. Try again.'); return j; }); })
      .then(function () {
        saved = true;
        $('done').style.display = 'flex';
        $('close').focus();
      })
      .catch(function (e) {
        panel.prepend(message('err', e.message));
      })
      .then(function () {
        btn.disabled = false; btn.textContent = 'Use in my email';
        doc.querySelectorAll('[data-b]').forEach(function (el) { el.classList.add(locked[el.getAttribute('data-b')] ? 'lock' : 'can'); });
      });
  });

  $('close').addEventListener('click', function () { window.close(); });
  window.addEventListener('beforeunload', function (e) {
    if (saved || !doc) return;
    if (BOOT.blocks.some(function (b) { return changed(b.id); })) { e.preventDefault(); e.returnValue = ''; }
  });

  load();
})();
</script>
</body>
</html>`;
}

const { applyTheme } = require('./theme');

module.exports = { customisePage: (...args) => applyTheme(customisePage(...args)) };
