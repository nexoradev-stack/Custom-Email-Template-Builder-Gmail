'use strict';

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
  html{color-scheme:light}
  *{box-sizing:border-box}
  body{margin:0;background:__PAGE__;font-family:Inter,Arial,sans-serif;color:__INK__;display:flex;flex-direction:column;min-height:100vh}
  .band{margin:12px 12px 0;background:__INK__;border-radius:16px;padding:14px 16px;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px}
  .logo{width:38px;height:38px;border-radius:10px;background:__PAGE__;color:__INK__;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:14px}
  .logo img{width:26px;height:auto;display:block}
  .title{font-family:'IBM Plex Mono',monospace;font-weight:500;font-size:15px;letter-spacing:1.6px;color:__PAGE__;text-align:center}
  .bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:14px 16px 4px}
  .name{font-size:17px;font-weight:600;flex:1;min-width:180px}
  .meta{font-size:12px;color:#5F6368}
  .tag{font-size:11px;font-weight:600;color:#7A4F01;background:#FEF7E0;border-radius:10px;padding:2px 8px;margin-left:8px}
  .toggle{display:flex;border:1px solid #DEDDD8;border-radius:17px;overflow:hidden;background:#FFFFFF}
  .toggle button{height:34px;padding:0 14px;border:0;background:#FFFFFF;color:#3C4043;font:inherit;font-size:13px;cursor:pointer}
  .toggle button[aria-pressed="true"]{background:__INK__;color:__PAGE__;font-weight:600}
  .close{height:34px;padding:0 16px;border:0;border-radius:17px;background:__ACCENT__;color:#FFFFFF;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
  button:focus-visible{outline:3px solid __ACCENT__;outline-offset:2px}
  .stage{flex:1;display:flex;justify-content:center;padding:12px}
  iframe{border:0;background:__PAGE__;width:100%;max-width:840px;height:calc(100vh - 210px);min-height:420px;transition:max-width .2s ease}
  .stage.mobile iframe{max-width:390px}
  .note{margin:0 12px 12px;background:__INK__;color:__PAGE__;border-radius:16px;padding:14px;text-align:center;font-size:13px}
  .note b{font-weight:600}
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
