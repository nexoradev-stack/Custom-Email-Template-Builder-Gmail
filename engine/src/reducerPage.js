'use strict';

/**
 * Image reducer: makes a copy of a photo under 1 MB, in the browser.
 * The photo never leaves the person's computer, so this page needs no sign-in or ticket.
 */

const { SQUOOSH_URL } = require('./imageLimit');

const CSP = "default-src 'none'; img-src 'self' blob: data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; frame-ancestors 'none'";

function reducerPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Image reducer · __APP__</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap">
<style>
  html{color-scheme:light}
  *{box-sizing:border-box}
  body{margin:0;font-family:Inter,Arial,sans-serif;background:#F7F7F2;color:#1F1F1F}
  .band{margin:12px 12px 0;background:__INK__;border-radius:16px;padding:12px 16px;display:grid;grid-template-columns:38px minmax(0,1fr) 38px;align-items:center;gap:12px}
  .logo{width:38px;height:38px;border-radius:10px;background:#F7F7F2;display:flex;align-items:center;justify-content:center}
  .logo img{width:26px;height:auto;display:block}
  .band h1{margin:0;font-family:'IBM Plex Mono',monospace;font-weight:500;font-size:15px;letter-spacing:1.6px;color:#F7F7F2;text-align:center}
  .wrap{max-width:760px;margin:32px auto;padding:0 20px}
  h2{font-size:24px;margin:0 0 6px;color:__INK__}
  .sub{color:#5F6368;margin:0 0 22px;font-size:14px;line-height:1.5}
  .drop{border:2px dashed __ACCENT_LIGHT__;border-radius:16px;background:#fff;padding:48px 20px;text-align:center}
  .drop.over{background:__ACCENT_TINT__;border-color:__ACCENT__}
  .drop .ic{width:64px;height:64px;border-radius:16px;background:__ACCENT_TINT__;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;font-size:30px}
  .drop b{display:block;font-size:17px;color:__INK__;margin-bottom:6px}
  .drop .small{color:#5F6368;font-size:13px}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;margin-top:16px;height:42px;padding:0 20px;border-radius:21px;border:1px solid __ACCENT__;background:__ACCENT__;color:#fff;font:inherit;font-weight:600;font-size:14px;cursor:pointer;text-decoration:none}
  .btn.o{background:#fff;color:__ACCENT_DARK__}
  .btn:focus-visible{outline:3px solid __ACCENT__;outline-offset:2px}
  .res{background:#fff;border:1px solid #E3E2DE;border-radius:16px;padding:20px;display:grid;grid-template-columns:260px 1fr;gap:22px;align-items:center}
  .res img{width:100%;max-height:200px;object-fit:contain;border-radius:10px;background:#F3F2F0;display:block}
  .sizes{display:flex;align-items:center;gap:12px;font-size:15px;margin:4px 0 12px}
  .old{color:#5F6368;text-decoration:line-through}.arrow{color:__ACCENT__;font-weight:700}.new{color:#137333;font-weight:700;font-size:20px}
  .ok{display:inline-block;background:#E6F4EA;color:#137333;border-radius:6px;padding:4px 8px;font-size:12px;font-weight:600;margin-bottom:10px}
  .bad{display:inline-block;background:#FDECEA;color:#A50E0E;border-radius:6px;padding:4px 8px;font-size:12px;font-weight:600;margin-bottom:10px}
  .meta{color:#5F6368;font-size:13px;line-height:1.6}
  .steps{display:flex;gap:10px;margin-top:22px}
  .steps div{flex:1;background:#fff;border:1px solid #E3E2DE;border-radius:12px;padding:12px;font-size:12.5px;color:#3C4043;line-height:1.45}
  .steps b{display:block;color:__ACCENT__;font-size:11px;letter-spacing:1px;margin-bottom:4px}
  .note{margin-top:14px;font-size:12.5px;color:#5F6368}
  .note a{color:__ACCENT_DARK__}
  .msg{margin-top:14px;padding:12px 14px;border-radius:8px;font-size:14px;background:#FDECEA;color:#A50E0E}
  .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
  @media (max-width:640px){.res{grid-template-columns:1fr}.steps{flex-direction:column}}
</style>
</head>
<body>
<div class="band"><div class="logo"><img src="__LOGO__" alt="__BRAND__"></div><h1>IMAGE REDUCER</h1><div></div></div>
<div class="wrap">
  <h2>Make a photo smaller</h2>
  <p class="sub">Images in templates must be 1 MB or smaller. Drop a photo here and we'll make a copy under 1 MB. Your photo never leaves this computer.</p>

  <div class="drop" id="drop">
    <div class="ic" aria-hidden="true">🖼️</div>
    <b>Drop a photo here</b>
    <span class="small">JPG, PNG, WebP or GIF · any size</span><br>
    <label class="btn" for="file">Choose a photo</label>
    <input class="sr" id="file" type="file" accept="image/jpeg,image/png,image/webp,image/gif">
  </div>

  <div class="res" id="result" hidden>
    <img id="out" alt="The smaller copy">
    <div>
      <span class="ok" id="badge">✓ Ready · under 1 MB</span>
      <div class="sizes"><span class="old" id="before"></span><span class="arrow">→</span><span class="new" id="after"></span></div>
      <div class="meta" id="meta"></div>
      <a class="btn" id="download" download>⬇ Download</a>
      <button class="btn o" id="again" type="button">Reduce another</button>
    </div>
  </div>
  <div id="status" role="status" aria-live="polite"></div>

  <div class="steps">
    <div><b>1 · DROP</b>Drop or choose the big photo</div>
    <div><b>2 · DOWNLOAD</b>Download the smaller copy</div>
    <div><b>3 · UPLOAD</b>Go back to the template tab and click Upload</div>
  </div>
  <p class="note">Prefer another tool? <a href="${SQUOOSH_URL}" target="_blank" rel="noopener">Use Google Squoosh</a>, which also works on your computer.</p>
</div>
<script>
(function () {
  var LIMIT = 1048576;
  var TARGET = Math.floor(LIMIT * 0.96);
  var MAX_SIDE = 2400;
  var $ = function (id) { return document.getElementById(id); };
  var lastUrl = null;

  function size(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function say(text) { $('status').innerHTML = ''; if (!text) return; var d = document.createElement('div'); d.className = 'msg'; d.textContent = text; $('status').appendChild(d); }

  function load(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('This file could not be opened as a picture. Use a JPG, PNG, WebP or GIF.')); };
      img.src = url;
    });
  }

  function draw(img, w, h, white) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var x = c.getContext('2d');
    if (white) { x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h); }
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, 0, 0, w, h);
    return c;
  }

  function blob(canvas, type, q) {
    return new Promise(function (resolve) { canvas.toBlob(function (b) { resolve(b); }, type, q); });
  }

  /* See-through pictures (logos) stay PNG so their background stays clear; photos become JPG. */
  function seeThrough(img) {
    var w = Math.min(img.naturalWidth, 200), h = Math.max(1, Math.round(img.naturalHeight * w / img.naturalWidth));
    var data = draw(img, w, h, false).getContext('2d').getImageData(0, 0, w, h).data;
    for (var i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
    return false;
  }

  async function shrink(file, img) {
    var w = img.naturalWidth, h = img.naturalHeight;
    var scale = Math.min(1, MAX_SIDE / Math.max(w, h));
    var png = /png|gif|webp/.test(file.type) && seeThrough(img);
    for (var round = 0; round < 12; round++) {
      var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
      if (png) {
        var p = await blob(draw(img, cw, ch, false), 'image/png');
        if (p && p.size <= TARGET) return { blob: p, w: cw, h: ch, type: 'PNG', ext: 'png' };
      } else {
        var canvas = draw(img, cw, ch, true);
        var qs = [0.88, 0.8, 0.72, 0.64];
        for (var i = 0; i < qs.length; i++) {
          var j = await blob(canvas, 'image/jpeg', qs[i]);
          if (j && j.size <= TARGET) return { blob: j, w: cw, h: ch, type: 'JPG', ext: 'jpg' };
        }
      }
      scale *= 0.8;
    }
    throw new Error('This picture could not be made small enough. Try Google Squoosh instead.');
  }

  async function run(file) {
    if (!file) return;
    say('');
    if (!/^image\\//.test(file.type)) { say('Choose a picture: JPG, PNG, WebP or GIF.'); return; }
    var loaded;
    try { loaded = await load(file); } catch (e) { say(e.message); return; }
    var base = (file.name || 'image').replace(/\\.[^.]*$/, '').replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 60) || 'image';
    try {
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      var r;
      if (file.size <= LIMIT) {
        r = { blob: file, w: loaded.img.naturalWidth, h: loaded.img.naturalHeight, type: (file.type.split('/')[1] || '').toUpperCase(), ext: (file.name.split('.').pop() || 'jpg') };
        $('badge').className = 'ok';
        $('badge').textContent = '✓ Already under 1 MB · you can upload it as it is';
      } else {
        $('drop').querySelector('b').textContent = 'Making it smaller…';
        r = await shrink(file, loaded.img);
        $('badge').className = 'ok';
        $('badge').textContent = '✓ Ready · under 1 MB';
      }
      lastUrl = URL.createObjectURL(r.blob);
      $('out').src = lastUrl;
      $('before').textContent = size(file.size);
      $('after').textContent = size(r.blob.size);
      var name = base + (file.size <= LIMIT ? '' : '-small') + '.' + r.ext;
      $('meta').textContent = r.w + ' × ' + r.h + ' px · ' + r.type + (/gif/.test(file.type) && file.size > LIMIT ? ' · moving GIFs become a still picture' : '') + ' · File name: ' + name;
      $('download').href = lastUrl;
      $('download').setAttribute('data-bytes', String(r.blob.size));
      $('download').setAttribute('download', name);
      $('drop').hidden = true;
      $('result').hidden = false;
      $('download').focus();
    } catch (e) {
      say(e.message);
    } finally {
      URL.revokeObjectURL(loaded.url);
      $('drop').querySelector('b').textContent = 'Drop a photo here';
    }
  }

  $('file').addEventListener('change', function () { run($('file').files[0]); $('file').value = ''; });
  var drop = $('drop');
  ['dragenter', 'dragover'].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { run(e.dataTransfer.files[0]); });
  $('again').addEventListener('click', function () { $('result').hidden = true; $('drop').hidden = false; say(''); });
})();
</script>
</body>
</html>`;
}

const { applyTheme } = require('./theme');

module.exports = { reducerPage: (...args) => applyTheme(reducerPage(...args)), CSP };
