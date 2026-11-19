'use strict';

const uploadCss = require('fs').readFileSync(require('path').join(__dirname, 'styles', 'upload.css'), 'utf8');

/* The 1 MB image limit with the red "Reduce it here" box. */
const { CLIENT: imgLimitJs } = require('./imageLimit');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** The small pop-up window an admin uses to upload an image. */
function uploadPage(ticket) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Upload image · __APP__</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&display=swap">
<style>
${uploadCss}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="band"><div class="logo"><img src="__LOGO__" alt="__BRAND__"></div><h1>TEMPLATE GALLERY</h1><div></div></div>
    <p>You get a permanent link to paste into your HTML.</p>

    <div class="drop" id="drop">
      <label class="btn" for="file">Choose file</label>
      <input class="sr" id="file" type="file" accept="image/png,image/jpeg,image/gif">
      <div class="hint">or drag an image here &middot; JPG, PNG or GIF &middot; <b>up to 1 MB</b></div>
    </div>

    <div id="big"></div>
    <div id="status" role="status" aria-live="polite"></div>
    <div id="results"></div>

    <p class="foot">When you're done, close this window to go back to Gmail.</p>
  </div>
</div>
<script>
${imgLimitJs}
</script>
<script>
(function () {
  var ticket = ${JSON.stringify(String(ticket))};
  var drop = document.getElementById('drop');
  var file = document.getElementById('file');
  var status = document.getElementById('status');
  var results = document.getElementById('results');

  function show(kind, text) {
    status.innerHTML = '';
    if (!text) return;
    var d = document.createElement('div');
    d.className = 'msg ' + kind;
    d.textContent = text;
    status.appendChild(d);
  }

  function addResult(data) {
    var box = document.createElement('div');
    box.className = 'result';
    var img = document.createElement('img');
    img.src = data.url; img.alt = data.name;
    var ok = document.createElement('div');
    ok.className = 'ok';
    ok.textContent = data.name + ' uploaded · ' + Math.max(1, Math.round(data.size / 1024)) + ' KB';
    var row = document.createElement('div');
    row.className = 'row';
    var input = document.createElement('input');
    input.readOnly = true; input.value = data.url; input.setAttribute('aria-label', 'Image link');
    var btn = document.createElement('button');
    btn.className = 'btn ghost'; btn.type = 'button'; btn.textContent = 'Copy';
    btn.addEventListener('click', function () {
      input.select();
      var done = function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy'; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(data.url).then(done, function () { document.execCommand('copy'); done(); });
      } else { document.execCommand('copy'); done(); }
    });
    row.appendChild(input); row.appendChild(btn);
    box.appendChild(img); box.appendChild(ok); box.appendChild(row);
    results.insertBefore(box, results.firstChild);
    if (data.warning) show('warn', data.warning);
  }

  function upload(f) {
    if (!f) return;
    var big = document.getElementById('big');
    IMGLIMIT.clear(big);
    if (!/^image\\/(png|jpeg|gif)$/.test(f.type)) { show('err', 'Only JPG, PNG or GIF images can be uploaded. The image reducer can turn other pictures into JPG.'); return; }
    if (f.size > IMGLIMIT.max) { show('', ''); IMGLIMIT.show(big, f.size, null, 'Reduce it, download the smaller copy, then choose it here.'); return; }
    show('warn', 'Uploading…');
    var body = new FormData();
    body.append('image', f);
    fetch('/upload?ticket=' + encodeURIComponent(ticket), { method: 'POST', body: body })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) {
          if (res.j.tooBig) { show('', ''); IMGLIMIT.show(big, res.j.size || f.size, null, 'Reduce it, download the smaller copy, then choose it here.'); return; }
          show('err', res.j.error || 'Upload failed. Try again.'); return;
        }
        show('', '');
        addResult(res.j);
      })
      .catch(function () { show('err', 'Upload failed. Check your connection and try again.'); });
  }

  file.addEventListener('change', function () { upload(file.files[0]); file.value = ''; });
  ['dragenter', 'dragover'].forEach(function (n) {
    drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (n) {
    drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.remove('over'); });
  });
  drop.addEventListener('drop', function (e) { upload(e.dataTransfer.files[0]); });
})();
</script>
</body>
</html>`;
}

function expiredPage(kind) {
  const what = kind === 'preview' ? 'preview' : kind === 'editor' ? 'editor' : kind === 'customise' ? 'customise' : 'upload';
  const button = kind === 'preview' ? 'Preview' : kind === 'editor' ? 'Edit code' : kind === 'customise' ? 'Customise' : 'Upload image';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Link expired</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;background:__PAGE__;margin:0;padding:40px 20px;color:#1F1F1F">
<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #DEDDD8;border-radius:16px;padding:24px">
<h1 style="font-size:20px;margin:0 0 8px">This ${what} link has expired</h1>
<p style="margin:0;color:#5F6368;line-height:1.5">Close this window, go back to Gmail and click <b>${button}</b> in the add-on again.</p>
</div></body></html>`;
}

/** A template that was hidden or removed after the link was made. */
function unavailablePage() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Template not available</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;background:__PAGE__;margin:0;padding:40px 20px;color:#1F1F1F">
<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #DEDDD8;border-radius:16px;padding:24px">
<h1 style="font-size:20px;margin:0 0 8px">This template isn\u2019t available</h1>
<p style="margin:0;color:#5F6368;line-height:1.5">It may have been hidden or removed. Ask an admin if you need it.</p>
</div></body></html>`;
}

const { applyTheme } = require('./theme');

module.exports = {
  uploadPage: (...args) => applyTheme(uploadPage(...args)),
  expiredPage: (...args) => applyTheme(expiredPage(...args)),
  unavailablePage: (...args) => applyTheme(unavailablePage(...args)),
  esc
};
