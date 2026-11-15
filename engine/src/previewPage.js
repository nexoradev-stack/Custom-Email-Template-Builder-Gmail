'use strict';

const previewCss = require('fs').readFileSync(require('path').join(__dirname, 'styles', 'preview.css'), 'utf8');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Full-size preview of one template, opened from the sidebar's Preview button. */
function previewPage({ name, category, html, draft }) {
  const frame = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:__PAGE__}.email{max-width:800px;margin:8px auto 24px}</style></head><body><div class="email">${html}</div></body></html>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Preview · ${esc(name)} · __APP__</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=IBM+Plex+Mono:wght@500&display=swap">
<style>
${previewCss}
</style>
</head>
<body>
  <div class="band"><div class="logo"><img src="__LOGO__" alt="__BRAND__"></div><div class="title">TEMPLATE GALLERY</div><div style="width:38px"></div></div>
  <div class="bar">
    <div class="name">${esc(name)}${draft ? '<span class="tag">Draft · admins only</span>' : ''}<div class="meta">${esc(category)}</div></div>
    <div class="toggle" role="group" aria-label="Preview size">
      <button type="button" id="desk" aria-pressed="true">Desktop</button>
      <button type="button" id="mob" aria-pressed="false">Mobile</button>
    </div>
    <button type="button" class="close" id="close">Close</button>
  </div>
  <div class="stage" id="stage">
    <iframe title="Email preview" sandbox="" srcdoc="${esc(frame)}"></iframe>
  </div>
  <div class="note">To use this template, close this window and click <b>Add to email</b> in the sidebar.</div>
<script>
  (function(){
    var stage=document.getElementById('stage'),d=document.getElementById('desk'),m=document.getElementById('mob');
    function set(mobile){stage.classList.toggle('mobile',mobile);d.setAttribute('aria-pressed',String(!mobile));m.setAttribute('aria-pressed',String(mobile));}
    d.addEventListener('click',function(){set(false);});
    m.addEventListener('click',function(){set(true);});
    document.getElementById('close').addEventListener('click',function(){window.close();});
  })();
</script>
</body>
</html>`;
}

const { applyTheme } = require('./theme');

module.exports = { previewPage: (...args) => applyTheme(previewPage(...args)) };
