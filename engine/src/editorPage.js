'use strict';

const editorCss = require('fs').readFileSync(require('path').join(__dirname, 'styles', 'editor.css'), 'utf8');

/**
 * Full-size editor, opened in a tab from the sidebar (New template / Edit code).
 * Two ways to build a template:
 *   - Build with blocks: add rows, click to change them, set what users may change.
 *   - Paste HTML: big code box with a live Gmail-ready preview and checks.
 * Works with a one-time ticket, like the upload and preview windows.
 */

const fs = require('fs');
const path = require('path');

/* The block builder runs in the admin's browser; its code lives in its own file. */
const builderJs = fs.readFileSync(path.join(__dirname, 'builder.client.js'), 'utf8');
if (/<\/script/i.test(builderJs)) throw new Error('builder.client.js must not contain a closing script tag');
/* Paste HTML extras (Edit in preview, undo and redo) also run in the browser. */
const htmlEditJs = fs.readFileSync(path.join(__dirname, 'htmledit.client.js'), 'utf8');
if (/<\/script/i.test(htmlEditJs)) throw new Error('htmledit.client.js must not contain a closing script tag');

/* The 1 MB image limit: grey hint and red "Reduce it here" box, shared with the other upload screens. */
const { CLIENT: imgLimitJs } = require('./imageLimit');

/** JSON that is safe to put inside a <script> tag. */
const safeJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function editorPage({ ticket, template, categories, fonts, libraryPrefix, domain: rawDomain }) {
  const domain = escHtml(rawDomain || 'example.com');
  const boot = {
    ticket: String(ticket),
    template: template || null,
    categories: categories || [],
    fonts: fonts || [],
    libraryPrefix: libraryPrefix || '',
    domain: String(rawDomain || 'example.com')
  };
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${template ? 'Edit' : 'New'} template · __APP__</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
${editorCss}
</style>
</head>
<body>
  <div class="band"><div class="logo"><img src="__LOGO__" alt="__BRAND__"></div><h1>TEMPLATE GALLERY</h1><div></div></div>

  <div class="bar">
    <label class="f">Template name<input id="name" maxlength="80" autocomplete="off"></label>
    <label class="f">Category<select id="category"></select></label>
    <div class="tabs" role="group" aria-label="How to build">
      <button type="button" id="tabBlocks" aria-pressed="false">Build with blocks</button>
      <button type="button" id="tabHtml" aria-pressed="true">Paste HTML</button>
    </div>
    <span class="status" id="status"></span>
    <span class="grow"></span>
    <div class="topbtns">
      <button class="btn" id="save" type="button">Save and check</button>
      <button class="btn" id="share" type="button">Share with people</button>
      <button class="btn fill" id="publish" type="button">Publish for everyone</button>
    </div>
  </div>

  <div class="bmain" id="blocksView" hidden>
    <nav class="pal" id="palette" aria-label="Add a row"><div class="bh">ADD A ROW</div></nav>
    <section class="canvas" id="canvas" aria-label="Your email">
      <div class="head"><span class="urbar"><button type="button" class="ur" id="bUndo" disabled>↶ Undo</button><button type="button" class="ur" id="bRedo" disabled>↷ Redo</button></span>YOUR EMAIL <span class="hint" style="margin:0" id="bstate"></span><span class="grow"></span>
        <div class="toggle" role="group" aria-label="Edit or preview">
          <button type="button" id="bEdit" aria-pressed="true">Edit</button>
          <button type="button" id="bPreview" aria-pressed="false">Preview</button>
        </div>
        <div class="toggle" role="group" aria-label="Screen size">
          <button type="button" id="bDesk" aria-pressed="true">Desktop</button>
          <button type="button" id="bMob" aria-pressed="false">Mobile</button>
        </div>
      </div>
      <iframe id="bframe" title="Your email, click a row to change it" sandbox="allow-same-origin"></iframe>
    </section>
    <aside class="side" aria-label="Row settings">
      <div id="bpanel"></div>
      <div id="bchecks" aria-live="polite"></div>
    </aside>
    <input type="file" id="bfile" accept="image/jpeg,image/png,image/webp,image/gif" hidden>
  </div>

  <div class="main" id="htmlView">
    <section class="pane" aria-label="HTML and CSS">
      <div class="head"><span class="urbar"><button type="button" class="ur" id="hUndo" disabled>↶ Undo</button><button type="button" class="ur" id="hRedo" disabled>↷ Redo</button></span>HTML AND CSS <span class="hint">· paste code from Figma, Gemini or Claude · Cmd/Ctrl + S saves</span></div>
      <textarea id="code" spellcheck="false" autocomplete="off" aria-label="HTML and CSS code"></textarea>
    </section>
    <section class="pane" aria-label="Preview">
      <div class="head"><span id="paneTitle">GMAIL-READY PREVIEW</span> <span class="hint" id="state"></span><span class="grow"></span>
        <div class="toggle" role="group" aria-label="What the preview shows">
          <button type="button" id="modePreview" aria-pressed="true">Preview</button>
          <button type="button" id="modeEdit" aria-pressed="false">Edit in preview</button>
          <button type="button" id="modeLocks" aria-pressed="false">User changes</button>
        </div>
        <div class="toggle" role="group" aria-label="Preview size">
          <button type="button" id="desk" aria-pressed="true">Desktop</button>
          <button type="button" id="mob" aria-pressed="false">Mobile</button>
        </div>
      </div>
      <div class="stage" id="stage"><iframe id="frame" title="Email preview" sandbox="allow-same-origin"></iframe></div>
      <div class="checks" id="checks" aria-live="polite"></div>
      <div class="checks" id="lockList" hidden></div>
      <div class="checks etools" id="editTools" hidden></div>
    </section>
  </div>

  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  <div class="modal" id="conflict" role="dialog" aria-modal="true" aria-labelledby="conflictTitle" hidden>
    <div class="mbox">
      <h3 id="conflictTitle">Someone else saved this template</h3>
      <p id="conflictText"></p>
      <div class="mbtns">
        <button type="button" class="btn" id="conflictCancel">Cancel</button>
        <button type="button" class="btn" id="conflictReload">Load their version</button>
        <button type="button" class="btn fill" id="conflictForce">Save mine anyway</button>
      </div>
    </div>
  </div>

  <div class="modal" id="doneBox" role="dialog" aria-modal="true" aria-labelledby="doneTitle" hidden>
    <div class="mbox" style="min-width:340px">
      <h3 id="doneTitle">Published for everyone</h3>
      <div class="mbtns" style="margin-top:16px"><button type="button" class="btn fill" id="doneOk">OK</button></div>
    </div>
  </div>

  <div class="modal" id="shareBox" role="dialog" aria-modal="true" aria-labelledby="shareTitle" hidden>
    <div class="mbox" style="max-width:560px;width:100%">
      <h3 id="shareTitle">Share with specific people</h3>
      <p id="shareLead">Only the people you add will see this template in their gallery. Everyone else won't. It stays a draft for everyone else.</p>
      <div class="mlab">ADD PEOPLE AT ${String(domain || '').toUpperCase()}</div>
      <div class="chips" id="shareChips"><input id="shareInput" type="email" autocomplete="off" placeholder="Type an email, then press Enter" aria-label="Email address"></div>
      <div class="mnote">Only ${String(domain || '')} email addresses can be added. Press Enter or comma after each one.</div>
      <div class="minfo" id="shareInfo">They will see it under <b>Shared with you</b> at the top of their gallery in Gmail.</div>
      <div class="merr" id="shareErr" hidden></div>
      <div class="mbtns">
        <button type="button" class="btn" id="shareStop" hidden>Stop sharing</button>
        <span class="grow"></span>
        <button type="button" class="btn" id="shareCancel">Cancel</button>
        <button type="button" class="btn fill" id="shareGo">Share</button>
      </div>
    </div>
  </div>

  <div class="modal" id="switchBox" role="dialog" aria-modal="true" aria-labelledby="switchTitle" hidden>
    <div class="mbox">
      <h3 id="switchTitle"></h3>
      <p id="switchText"></p>
      <div class="mbtns" id="switchBtns"></div>
    </div>
  </div>

<script>
${imgLimitJs}
</script>
<script>
(function () {
  var BOOT = ${safeJson(boot)};
  var ticket = BOOT.ticket;
  var t = BOOT.template || { name: '', category: '', sourceHtml: '', status: 'new' };
  var $ = function (id) { return document.getElementById(id); };
  var nameEl = $('name'), catEl = $('category'), code = $('code'), frame = $('frame');
  var savedJson = '';
  var busy = false, timer = null, seq = 0;
  var locks = (t.locks || []).slice();
  var blocks = [], lastHtml = '', lockMode = false;

  BOOT.categories.forEach(function (c) {
    var o = document.createElement('option');
    o.value = c.name; o.textContent = c.name;
    catEl.appendChild(o);
  });
  nameEl.value = t.name || '';
  if (t.category) catEl.value = t.category;
  code.value = t.sourceHtml || '';

  function dirty() {
    return JSON.stringify(payload()) !== savedJson;
  }

  var sharedWith = (t.sharedWith || []).slice();
  var sharedStale = Boolean(t.sharedStale);

  function shortName(email) { var n = String(email).split('@')[0].split(/[._-]/)[0] || email; return n.charAt(0).toUpperCase() + n.slice(1); }
  function peopleText(list) {
    var names = list.map(shortName);
    return names.length <= 2 ? names.join(' and ') : names.slice(0, 2).join(', ') + ' and ' + (names.length - 2) + ' more';
  }

  function setStatus() {
    var s = $('status');
    var shared = t.status !== 'published' && sharedWith.length > 0;
    var label = t.status === 'published' ? (t.hasUnpublishedChanges ? 'Published · changes not live' : 'Published · live')
      : shared ? 'Shared with ' + peopleText(sharedWith) + (sharedStale ? ' · changes not shared yet' : '')
      : t.status === 'unpublished' ? 'Unpublished' : t.status === 'draft' ? 'Draft · admins only' : 'Not saved yet';
    if (dirty()) label += ' · unsaved edits';
    s.textContent = label;
    s.title = label;
    s.className = 'status' + (t.status === 'published' && !t.hasUnpublishedChanges && !dirty() ? ' live' : shared ? ' shared' : t.status === 'new' ? '' : ' draft');
    var sb = $('share');
    sb.hidden = false;
    sb.textContent = shared ? 'Shared · ' + sharedWith.length + (sharedWith.length === 1 ? ' person' : ' people') : 'Share with people';
  }

  function toast(text, isErr) {
    var el = $('toast');
    el.textContent = text;
    el.className = 'toast' + (isErr ? ' err' : '');
    el.style.display = 'block';
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { el.style.display = 'none'; }, isErr ? 6000 : 3500);
  }

  var LOCK_CSS = '[data-b]{cursor:pointer;outline:2px dashed __ACCENT__;outline-offset:-2px}' +
    '[data-b].locked{outline:2px dashed #9AA0A6;opacity:.45}' +
    '[data-b]:hover{outline-style:solid}';

  function showPreview(html) {
    lastHtml = html;
    frame.srcdoc = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#F3F2F0}.email{max-width:600px;margin:16px auto;background:#fff}' +
      (lockMode ? LOCK_CSS : '') + '</style></head><body><div class="email">' + html + '</div></body></html>';
  }

  frame.addEventListener('load', function () {
    var doc = frame.contentDocument;
    if (!doc) return;
    doc.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a');
      if (a) e.preventDefault();
      if (!lockMode) return;
      var el = e.target.closest && e.target.closest('[data-b]');
      if (el) toggleLock(el.getAttribute('data-b'));
    }, true);
    paintLocks();
    if (window.ED && window.ED.onPreviewLoad) window.ED.onPreviewLoad(doc);
  });

  function paintLocks() {
    var doc = frame.contentDocument;
    if (!doc || !lockMode) return;
    doc.querySelectorAll('[data-b]').forEach(function (el) {
      el.classList.toggle('locked', locks.indexOf(el.getAttribute('data-b')) !== -1);
      el.title = locks.indexOf(el.getAttribute('data-b')) !== -1 ? 'Locked: users cannot change this. Click to allow.' : 'Users can change this. Click to lock.';
    });
  }

  function toggleLock(id) {
    var i = locks.indexOf(id);
    if (i === -1) locks.push(id); else locks.splice(i, 1);
    paintLocks(); renderLocks(); setStatus();
    if (window.ED && window.ED.onLocksChanged) window.ED.onLocksChanged();
  }

  function renderLocks() {
    var box = $('lockList');
    box.innerHTML = '';
    var hint = document.createElement('div');
    hint.className = 'lockhint';
    if (!blocks.length) { hint.textContent = 'Paste the code first. Every photo and text part will be listed here.'; box.appendChild(hint); return; }
    var open = blocks.filter(function (b) { return locks.indexOf(b.id) === -1; }).length;
    hint.textContent = 'Users can change ' + open + ' of ' + blocks.length + ' parts with the Customise button. Click a part in the email, or untick it here, to lock it. Then Save.';
    box.appendChild(hint);
    blocks.forEach(function (b) {
      var row = document.createElement('label');
      row.className = 'lockrow';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = locks.indexOf(b.id) === -1;
      cb.addEventListener('change', function () { toggleLock(b.id); });
      var s = document.createElement('span');
      s.textContent = (b.type === 'image' ? 'Photo · ' : 'Text · ') + b.label;
      row.appendChild(cb); row.appendChild(s);
      box.appendChild(row);
    });
  }

  function setMode(on) {
    if (window.ED && window.ED.onLockMode) window.ED.onLockMode(on);
    lockMode = on;
    $('modePreview').setAttribute('aria-pressed', String(!on));
    $('modeLocks').setAttribute('aria-pressed', String(on));
    $('checks').hidden = on;
    $('lockList').hidden = !on;
    $('paneTitle').textContent = on ? 'WHAT USERS CAN CHANGE' : 'GMAIL-READY PREVIEW';
    if (lastHtml) showPreview(lastHtml);
    renderLocks();
  }
  $('modePreview').addEventListener('click', function () { setMode(false); });
  $('modeLocks').addEventListener('click', function () { setMode(true); });

  function showChecks(checks) {
    var box = $('checks');
    box.innerHTML = '';
    (checks || []).forEach(function (c) {
      var d = document.createElement('div');
      d.className = 'c-' + c.level;
      var b = document.createElement('b');
      b.textContent = c.level === 'error' ? 'Fix: ' : c.level === 'warn' ? 'Check: ' : c.level === 'info' ? 'ⓘ ' : '✓ ';
      d.appendChild(b);
      d.appendChild(document.createTextNode(c.message));
      box.appendChild(d);
    });
  }

  function post(path, body) {
    return fetch(path + '?ticket=' + encodeURIComponent(ticket), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || 'Something went wrong. Try again.'); e.data = j; throw e; }
        return j;
      });
    });
  }

  function check() {
    var mine = ++seq;
    if (!code.value.trim()) {
      frame.removeAttribute('srcdoc');
      $('checks').innerHTML = '<div class="empty">Paste your HTML on the left. The Gmail-ready version appears here.</div>';
      $('state').textContent = '';
      return;
    }
    $('state').textContent = '· checking…';
    post('/editor/check', { sourceHtml: code.value }).then(function (r) {
      if (mine !== seq) return;
      blocks = r.blocks || [];
      showPreview(r.html || '');
      showChecks(r.checks);
      renderLocks();
      $('state').textContent = '· updated';
      if (window.ED && window.ED.onChecked) window.ED.onChecked(r);
    }).catch(function (e) {
      if (mine !== seq) return;
      $('state').textContent = '';
      toast(e.message, true);
    });
  }

  function lock(on) {
    busy = on;
    $('save').disabled = on;
    $('publish').disabled = on;
    $('share').disabled = on;
  }

  function payload() {
    var base = { name: nameEl.value, category: catEl.value };
    var rest = window.BUILDER && window.BUILDER.active()
      ? window.BUILDER.payload()
      : { sourceHtml: code.value, locks: locks, mode: 'html' };
    for (var k in rest) base[k] = rest[k];
    return base;
  }

  var baseAt = t.updatedAtMs || 0;
  var leaving = false;

  function withBase(p, force) {
    var out = {};
    for (var k in p) out[k] = p[k];
    out.baseUpdatedAt = baseAt;
    if (force) out.force = true;
    return out;
  }

  function showConflict(c, retry) {
    var when = '';
    try { when = new Date(c.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (e) { when = ''; }
    $('conflictText').textContent = c.by + ' saved this template' + (when ? ' at ' + when : '') + ', after you opened it. ' +
      'Saving now would replace their changes. You can load their version (your unsaved changes here are lost), or save yours anyway.';
    $('conflict').hidden = false;
    $('conflictForce').focus();
    $('conflictCancel').onclick = function () { $('conflict').hidden = true; };
    $('conflictReload').onclick = function () { leaving = true; location.reload(); };
    $('conflictForce').onclick = function () { $('conflict').hidden = true; retry(); };
  }

  function afterSave(r) {
    if (r.updatedAtMs) baseAt = r.updatedAtMs;
    if (r.locks && !(window.BUILDER && window.BUILDER.active())) locks = r.locks.slice();
    savedJson = JSON.stringify(payload());
    t.status = r.status || (t.status === 'new' ? 'draft' : t.status);
    t.hasUnpublishedChanges = Boolean(r.hasUnpublishedChanges);
    if (r.sharedWith) sharedWith = r.sharedWith.slice();
    if (r.sharedStale !== undefined) sharedStale = Boolean(r.sharedStale);
    if (r.checks) showChecks(r.checks);
    paintLocks(); renderLocks();
    setStatus();
  }

  function save(force) {
    if (busy) return;
    lock(true);
    post('/editor/save', withBase(payload(), force === true)).then(function (r) {
      afterSave(r);
      toast(r.hasErrors ? 'Saved. Some problems must be fixed before publishing.' : 'Saved and checked. Only admins can see it until you publish.', r.hasErrors);
    }).catch(function (e) {
      if (e.data && e.data.conflict) showConflict(e.data.conflict, function () { save(true); });
      else toast(e.message, true);
    }).then(function () { lock(false); });
  }

  function publish(force) {
    if (busy) return;
    lock(true);
    post('/editor/publish', withBase(payload(), force === true)).then(function (r) {
      afterSave(r);
      t.status = 'published'; t.hasUnpublishedChanges = false; sharedWith = []; sharedStale = false; setStatus();
      $('doneBox').hidden = false;
      $('doneOk').focus();
    }).catch(function (e) {
      if (e.data && e.data.conflict) { showConflict(e.data.conflict, function () { publish(true); }); return; }
      if (e.data && e.data.checks) showChecks(e.data.checks);
      toast(e.message, true);
    }).then(function () { lock(false); });
  }

  $('save').addEventListener('click', function () { save(false); });
  $('publish').addEventListener('click', function () { publish(false); });
  $('doneOk').addEventListener('click', function () { $('doneBox').hidden = true; });

  /* ---------- Share with specific people ---------- */
  var draftPeople = [];
  var DOMAIN = String(BOOT.domain || '').toLowerCase();

  function shareError(text) { $('shareErr').hidden = !text; $('shareErr').textContent = text || ''; }

  function drawChips() {
    var box = $('shareChips'), input = $('shareInput');
    Array.prototype.slice.call(box.querySelectorAll('.chip')).forEach(function (c) { c.remove(); });
    draftPeople.forEach(function (email, i) {
      var c = document.createElement('span');
      c.className = 'chip';
      var av = document.createElement('i'); av.textContent = shortName(email).charAt(0);
      var b = document.createElement('b'); b.textContent = shortName(email); b.style.fontWeight = '600';
      var e = document.createElement('span'); e.textContent = email; e.style.color = '#5F6368';
      var x = document.createElement('button'); x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', 'Remove ' + email);
      x.addEventListener('click', function () { draftPeople.splice(i, 1); drawChips(); });
      c.appendChild(av); c.appendChild(b); c.appendChild(e); c.appendChild(x);
      box.insertBefore(c, input);
    });
    var n = draftPeople.length;
    var same = n === sharedWith.length && draftPeople.every(function (p) { return sharedWith.indexOf(p) !== -1; });
    $('shareGo').textContent = !n ? (sharedWith.length ? 'Stop sharing' : 'Share') : (same && sharedWith.length ? 'Share again with ' : 'Share with ') + n + (n === 1 ? ' person' : ' people');
    $('shareGo').disabled = !n && !sharedWith.length;
    $('shareStop').hidden = !sharedWith.length || !n;
    $('shareInfo').innerHTML = '';
    $('shareInfo').appendChild(document.createTextNode(n === 1 ? shortName(draftPeople[0]) + ' will see it under ' : 'They will see it under '));
    var strong = document.createElement('b'); strong.textContent = 'Shared with you';
    $('shareInfo').appendChild(strong);
    $('shareInfo').appendChild(document.createTextNode(' at the top of ' + (n === 1 ? 'their' : 'their') + ' gallery in Gmail.' + (sharedStale ? ' You have changes they don\\'t have yet: click Share again to send them the latest version.' : '')));
  }

  function addPerson(raw) {
    var parts = String(raw || '').split(/[\\s,;]+/);
    var bad = '';
    parts.forEach(function (p) {
      var email = p.trim().toLowerCase();
      if (!email) return;
      if (!/^[^\\s@<>"']+@[^\\s@<>"']+\\.[a-z]{2,}$/.test(email)) { bad = '"' + p + '" is not an email address.'; return; }
      if (DOMAIN && email.slice(-DOMAIN.length - 1) !== '@' + DOMAIN) { bad = 'Only ' + DOMAIN + ' addresses can be added.'; return; }
      if (draftPeople.indexOf(email) === -1) draftPeople.push(email);
    });
    shareError(bad);
    drawChips();
    return !bad;
  }

  function shareMode(published) {
    ['shareChips', 'shareInfo', 'shareGo', 'shareStop'].forEach(function (id) { $(id).hidden = published; });
    $('shareBox').querySelector('.mlab').hidden = published;
    $('shareBox').querySelector('.mnote').hidden = published;
    $('shareLead').textContent = published
      ? 'This template is published for everyone, so everyone already has it. To give it only to specific people, unpublish it in the Gmail add-on first (template page, More options, Unpublish), then share it here.'
      : 'Only the people you add will see this template in their gallery. Everyone else won’t. It stays a draft for everyone else.';
    $('shareCancel').textContent = published ? 'OK' : 'Cancel';
  }

  function openShare() {
    if (busy) return;
    shareMode(t.status === 'published');
    if (t.status === 'published') { shareError(''); $('shareBox').hidden = false; $('shareCancel').focus(); return; }
    draftPeople = sharedWith.slice();
    shareError('');
    $('shareInput').value = '';
    drawChips();
    $('shareBox').hidden = false;
    $('shareInput').focus();
  }

  function doShare(people, force) {
    if (busy) return;
    lock(true);
    var body = withBase(payload(), force === true);
    body.people = people;
    post('/editor/share', body).then(function (r) {
      afterSave(r);
      sharedWith = (r.sharedWith || []).slice();
      sharedStale = false;
      setStatus();
      $('shareBox').hidden = true;
      toast(sharedWith.length ? 'Shared with ' + peopleText(sharedWith) + '. They will see it in their gallery in Gmail.' : 'Stopped sharing. Only admins can see it now.');
    }).catch(function (e) {
      if (e.data && e.data.conflict) { $('shareBox').hidden = true; showConflict(e.data.conflict, function () { doShare(people, true); }); return; }
      if (e.data && e.data.checks) showChecks(e.data.checks);
      shareError(e.message);
    }).then(function () { lock(false); });
  }

  $('share').addEventListener('click', openShare);
  $('shareCancel').addEventListener('click', function () { $('shareBox').hidden = true; });
  $('shareChips').addEventListener('click', function () { $('shareInput').focus(); });
  $('shareInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ';' || e.key === ' ') {
      e.preventDefault();
      if ($('shareInput').value.trim()) { if (addPerson($('shareInput').value)) $('shareInput').value = ''; }
      else if (e.key === 'Enter' && draftPeople.length) $('shareGo').click();
    } else if (e.key === 'Backspace' && !$('shareInput').value && draftPeople.length) {
      draftPeople.pop(); drawChips();
    }
  });
  $('shareInput').addEventListener('blur', function () { if ($('shareInput').value.trim() && addPerson($('shareInput').value)) $('shareInput').value = ''; });
  $('shareInput').addEventListener('paste', function (e) {
    var text = (e.clipboardData || window.clipboardData).getData('text');
    if (/[\\s,;]/.test(text.trim())) { e.preventDefault(); addPerson(text); }
  });
  $('shareGo').addEventListener('click', function () {
    if ($('shareInput').value.trim()) { if (!addPerson($('shareInput').value)) return; $('shareInput').value = ''; }
    doShare(draftPeople.slice());
  });
  $('shareStop').addEventListener('click', function () { doShare([]); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if (!$('shareBox').hidden) $('shareBox').hidden = true; if (!$('doneBox').hidden) $('doneBox').hidden = true; }
  });
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); save(false); }
  });
  [nameEl, catEl].forEach(function (el) { el.addEventListener('input', setStatus); el.addEventListener('change', setStatus); });
  code.addEventListener('input', function () { setStatus(); clearTimeout(timer); timer = setTimeout(check, 700); });
  code.addEventListener('keydown', function (e) {
    if (e.key === 'Tab' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      var s = code.selectionStart, end = code.selectionEnd;
      code.value = code.value.slice(0, s) + '  ' + code.value.slice(end);
      code.selectionStart = code.selectionEnd = s + 2;
      setStatus();
    }
  });
  window.addEventListener('beforeunload', function (e) { if (!leaving && dirty()) { e.preventDefault(); e.returnValue = ''; } });

  var stage = $('stage'), d = $('desk'), m = $('mob');
  function size(mobile) { stage.classList.toggle('mobile', mobile); d.setAttribute('aria-pressed', String(!mobile)); m.setAttribute('aria-pressed', String(mobile)); }
  d.addEventListener('click', function () { size(false); });
  m.addEventListener('click', function () { size(true); });

  window.ED = {
    ticket: ticket,
    boot: { mode: t.mode || 'html', blocks: t.blocks || null, sourceHtml: t.sourceHtml || '' },
    fonts: BOOT.fonts,
    libraryPrefix: BOOT.libraryPrefix,
    post: post,
    toast: toast,
    maxImage: window.IMGLIMIT ? window.IMGLIMIT.max : 1048576,
    name: function () { return nameEl.value; },
    code: function () { return code.value; },
    setCode: function (v) { code.value = v; check(); if (ED.onCodeSet) ED.onCodeSet(); },
    changed: function () { setStatus(); },
    ready: function () { savedJson = JSON.stringify(payload()); setStatus(); },
    html: {
      codeEl: code,
      frame: frame,
      getLocks: function () { return locks.slice(); },
      setLocks: function (a) { locks = a.slice(); paintLocks(); renderLocks(); setStatus(); },
      showPreview: showPreview,
      lastHtml: function () { return lastHtml; },
      check: check,
      showChecks: showChecks,
      isLockMode: function () { return lockMode; },
      setLockMode: setMode,
      setStatus: setStatus
    }
  };

  if (t.checks && t.checks.length) showChecks(t.checks);
  check();
  (t.name ? code : nameEl).focus();
})();
</script>
<script>
${builderJs}
</script>
<script>
${htmlEditJs}
</script>
</body>
</html>`;
}

const { applyTheme } = require('./theme');

module.exports = { editorPage: (...args) => applyTheme(editorPage(...args)) };
