'use strict';

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
  *{box-sizing:border-box}
  body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#1F1F1F;background:__PAGE__}
  .wrap{max-width:520px;margin:0 auto;padding:28px 20px}
  .card{background:#fff;border:1px solid #DADCE0;border-radius:12px;padding:24px}
  html{color-scheme:light}
  .band{background:__INK__;border-radius:16px;padding:14px 16px;display:grid;grid-template-columns:38px minmax(0,1fr) 38px;align-items:center;gap:10px;margin-bottom:18px}
  .logo{width:38px;height:38px;border-radius:10px;background:__PAGE__;color:__INK__;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center}
  .logo img{width:26px;height:auto;display:block}
  h1{margin:0;font-family:'IBM Plex Mono',monospace;font-weight:500;font-size:15px;letter-spacing:1.6px;color:__PAGE__;text-align:center}
  p{margin:6px 0 0;color:#5F6368;font-size:14px;line-height:1.5}
  .drop{margin-top:18px;border:2px dashed __ACCENT_LIGHT__;background:__ACCENT_WASH__;border-radius:10px;padding:26px;text-align:center}
  .drop.over{background:__ACCENT_TINT__;border-color:__ACCENT__}
  .btn{display:inline-flex;align-items:center;justify-content:center;height:44px;padding:0 22px;border-radius:22px;border:0;background:__ACCENT__;color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit}
  .btn.ghost{background:#fff;color:#0042CC;border:1px solid #DADCE0}
  .btn:focus-visible,input:focus-visible{outline:3px solid __ACCENT__;outline-offset:2px}
  .hint{font-size:12px;color:#5F6368;margin-top:10px}
  .msg{margin-top:16px;padding:12px 14px;border-radius:8px;font-size:14px;line-height:1.45}
  .msg.err{background:#FCE8E6;color:#A50E0E}
  .msg.warn{background:#FEF7E0;color:#7A4F01}
  .result{margin-top:16px;border:1px solid #DADCE0;border-radius:10px;padding:14px}
  .result img{max-width:100%;max-height:140px;display:block;margin:0 auto 12px;border-radius:6px}
  .ok{color:#137333;font-size:13px;font-weight:700;margin-bottom:8px}
  .row{display:flex;gap:8px}
  .row input{flex:1;min-width:0;height:44px;border:1px solid #DADCE0;border-radius:8px;padding:0 10px;font-family:monospace;font-size:12px;background:#F8F9FA;color:#3C4043}
  .foot{margin-top:18px;font-size:13px;color:#5F6368}
  .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
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
      <div class="hint">or drag an image here &middot; JPG, PNG or GIF &middot; up to 10 MB</div>
    </div>

    <div id="status" role="status" aria-live="polite"></div>
    <div id="results"></div>

    <p class="foot">When you're done, close this window to go back to Gmail.</p>
  </div>
</div>
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
    if (!/^image\\/(png|jpeg|gif)$/.test(f.type)) { show('err', 'Only JPG, PNG or GIF images can be uploaded.'); return; }
    if (f.size > 10 * 1024 * 1024) { show('err', 'That image is over 10 MB. Make it smaller and try again.'); return; }
    show('warn', 'Uploading…');
    var body = new FormData();
    body.append('image', f);
    fetch('/upload?ticket=' + encodeURIComponent(ticket), { method: 'POST', body: body })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) { show('err', res.j.error || 'Upload failed. Try again.'); return; }
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

const { applyTheme } = require('./theme');

module.exports = {
  uploadPage: (...args) => applyTheme(uploadPage(...args)),
  expiredPage: (...args) => applyTheme(expiredPage(...args)),
  esc
};
