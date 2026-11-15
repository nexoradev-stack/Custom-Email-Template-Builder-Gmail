'use strict';

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

/** JSON that is safe to put inside a <script> tag. */
const safeJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

function editorPage({ ticket, template, categories, fonts, libraryPrefix }) {
  const boot = {
    ticket: String(ticket),
    template: template || null,
    categories: categories || [],
    fonts: fonts || [],
    libraryPrefix: libraryPrefix || ''
  };
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${template ? 'Edit' : 'New'} template · __APP__</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
  html{color-scheme:light}
  *{box-sizing:border-box}
  body{margin:0;background:__PAGE__;font-family:Inter,Arial,sans-serif;color:__INK__;height:100vh;display:flex;flex-direction:column;overflow:hidden}
  .band{margin:12px 12px 0;background:__INK__;border-radius:16px;padding:12px 16px;display:grid;grid-template-columns:38px minmax(0,1fr) 38px;align-items:center;gap:12px;flex-shrink:0}
  .logo{width:38px;height:38px;border-radius:10px;background:__PAGE__;color:__INK__;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:14px}
  .logo img{width:26px;height:auto;display:block}
  .band h1{margin:0;font-family:'IBM Plex Mono',monospace;font-weight:500;font-size:15px;letter-spacing:1.6px;color:__PAGE__;text-align:center}
  .bar{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px;padding:12px 16px 10px;flex-shrink:0}
  label.f{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#5F6368}
  .f input,.f select{height:38px;border:1px solid #C9CCD1;border-radius:8px;padding:0 10px;font:inherit;font-size:14px;color:__INK__;background:#fff}
  .f input{width:260px}
  .f select{width:170px}
  .status{font-size:12px;font-weight:600;border-radius:12px;padding:4px 10px;background:#E8EAED;color:#3C4043;align-self:center;margin-top:16px}
  .status.draft{background:#FEF7E0;color:#7A4F01}
  .status.live{background:#E6F4EA;color:#137333}
  .grow{flex:1}
  .btn{height:38px;padding:0 18px;border-radius:19px;border:1px solid #747775;background:#fff;color:__ACCENT_DARK__;font:inherit;font-size:14px;font-weight:500;cursor:pointer;white-space:nowrap}
  .btn.fill{background:__ACCENT__;border-color:__ACCENT__;color:#fff}
  .btn:disabled{opacity:.5;cursor:default}
  .btn:focus-visible,.f input:focus-visible,.f select:focus-visible,textarea:focus-visible{outline:3px solid __ACCENT__;outline-offset:1px}
  .main{flex:1;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;padding:0 12px 12px;min-height:0}
  .pane{background:#fff;border:1px solid #DEDDD8;border-radius:12px;display:flex;flex-direction:column;min-height:0;overflow:hidden}
  .head{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #EEEDEA;font-size:12px;font-weight:600;letter-spacing:.6px;color:#5F6368;flex-shrink:0}
  .head .grow{flex:1}
  .hint{font-weight:400;letter-spacing:0;color:#80868B}
  textarea{flex:1;border:0;resize:none;padding:12px 14px;font:13px/1.55 'IBM Plex Mono',ui-monospace,Menlo,monospace;color:#1F1F1F;background:#FCFCFA;white-space:pre;overflow:auto;tab-size:2}
  .toggle{display:flex;border:1px solid #DEDDD8;border-radius:14px;overflow:hidden}
  .toggle button{height:26px;padding:0 10px;white-space:nowrap;border:0;background:#fff;color:#3C4043;font:inherit;font-size:12px;cursor:pointer}
  .toggle button[aria-pressed="true"]{background:__INK__;color:__PAGE__}
  .stage{flex:1;display:flex;justify-content:center;background:#F3F2F0;min-height:0;overflow:hidden}
  iframe{border:0;width:100%;max-width:680px;height:100%;background:#F3F2F0;transition:max-width .2s ease}
  .stage.mobile iframe{max-width:390px}
  .checks{max-height:34%;overflow:auto;border-top:1px solid #EEEDEA;padding:8px 12px;font-size:13px;line-height:1.45;flex-shrink:0}
  .checks div{padding:3px 0}
  .c-error b{color:#C5221F}.c-warn b{color:#B06000}.c-ok b{color:#137333}
  .empty{color:#80868B;font-size:13px;padding:24px;text-align:center}
  .lockrow{display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px solid #F4F4F2;font-size:13px}
  .lockrow span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .lockrow input{width:16px;height:16px;accent-color:__ACCENT__;flex-shrink:0}
  .lockhint{font-size:12px;color:#5F6368;padding:2px 0 6px;line-height:1.45}
  .toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:__INK__;color:__PAGE__;border-radius:10px;padding:12px 18px;font-size:14px;box-shadow:0 6px 24px rgba(4,10,27,.3);display:none;max-width:90vw}
  .toast.err{background:#A50E0E}
  .tabs{display:flex;border:1px solid #DEDDD8;border-radius:19px;overflow:hidden;background:#fff;align-self:flex-end}
  .tabs button{height:36px;padding:0 14px;border:0;background:#fff;color:#3C4043;font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}
  .tabs button[aria-pressed="true"]{background:__INK__;color:__PAGE__;font-weight:600}
  .bmain{flex:1;display:grid;grid-template-columns:170px minmax(0,1fr) 300px;gap:12px;padding:0 12px 12px;min-height:0}
  .bmain[hidden],.main[hidden]{display:none}
  .pal{background:#fff;border:1px solid #DEDDD8;border-radius:12px;padding:12px;overflow:auto}
  .pal .bh{margin-bottom:8px}
  .pitem{display:flex;align-items:center;gap:10px;width:100%;border:1px solid #E3E2DE;border-radius:9px;padding:8px 10px;margin-bottom:7px;font:inherit;font-size:13px;background:#FCFCFA;cursor:pointer;text-align:left;color:__INK__}
  .pitem:hover{border-color:__ACCENT__;background:__ACCENT_WASH__}
  .pitem i{width:24px;height:20px;border-radius:5px;background:__ACCENT_TINT__;flex-shrink:0;position:relative}
  .pitem i::after{content:'';position:absolute;left:5px;right:5px;top:8px;height:3px;background:__ACCENT__;border-radius:2px}
  .pal small{display:block;font-size:11px;color:#80868B;margin-top:8px;line-height:1.45}
  .canvas{background:#F1F3F4;border-radius:12px;overflow:hidden;display:flex;min-height:0;flex-direction:column}
  .canvas .head{background:#fff}
  .canvas iframe{max-width:none;flex:1;align-self:center;width:100%;transition:max-width .2s ease}
  .canvas.mobile iframe{max-width:390px;border-left:1px solid #DEDDD8;border-right:1px solid #DEDDD8}
  .fsel{width:100%;height:32px;border:1px solid #C9CCD1;border-radius:8px;padding:0 8px;font:inherit;font-size:12.5px;background:#fff}
  .hrow{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
  .side{background:#fff;border:1px solid #DEDDD8;border-radius:12px;padding:14px;overflow:auto;min-height:0}
  .bh{font-size:11.5px;letter-spacing:.7px;color:#5F6368;font-weight:600}
  .phead{display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin-bottom:12px}
  .acts{display:flex;gap:4px}
  .act{height:26px;min-width:26px;padding:0 8px;border-radius:7px;border:1px solid #C9CCD1;background:#fff;font:inherit;font-size:12px;cursor:pointer;color:#3C4043}
  .act:hover{border-color:__ACCENT__;color:__ACCENT_DARK__}
  .act.del:hover{border-color:#C5221F;color:#C5221F}
  .grp{margin-bottom:12px}
  .lab{font-size:11.5px;color:#5F6368;margin-bottom:5px}
  .side .seg{display:flex;border:1px solid #C9CCD1;border-radius:8px;overflow:hidden}
  .side .seg button{flex:1;height:30px;border:0;border-left:1px solid #E3E2DE;background:#fff;font:inherit;font-size:12px;cursor:pointer;color:#3C4043;padding:0 4px;white-space:nowrap}
  .side .seg button:first-child{border-left:0}
  .side .seg button[aria-pressed="true"]{background:__ACCENT_TINT__;color:__ACCENT_DARK__;font-weight:600}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .two3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
  .mini{display:flex;flex-direction:column;gap:3px;font-size:11px;color:#80868B}
  .num{display:flex;align-items:center;border:1px solid #C9CCD1;border-radius:8px;overflow:hidden;background:#fff}
  .num input{width:100%;min-width:0;height:30px;border:0;padding:0 6px;font:inherit;font-size:12.5px}
  .num span{font-size:11px;color:#80868B;padding-right:6px}
  .colr{display:flex;align-items:center;gap:6px;border:1px solid #C9CCD1;border-radius:8px;padding:2px 6px;background:#fff}
  .colr input[type=color]{width:24px;height:24px;border:0;padding:0;background:none;cursor:pointer}
  .colr input[type=text]{width:100%;min-width:0;border:0;height:28px;font:inherit;font-size:12.5px}
  .tin{width:100%;height:32px;border:1px solid #C9CCD1;border-radius:8px;padding:0 9px;font:inherit;font-size:12.5px;margin-bottom:8px}
  .stack{display:flex;flex-direction:column;gap:8px;margin-bottom:6px}
  .btn.sm{height:30px;font-size:12.5px;padding:0 12px}
  .hint{font-size:12px;color:#5F6368;line-height:1.45;margin:0 0 12px}
  .tog{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;padding:10px 0 2px;border-top:1px solid #F1F3F4;cursor:pointer}
  .tog input{width:18px;height:18px;accent-color:__ACCENT__}
  .fmt{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}
  .fmt .act{height:28px;min-width:30px}
  .fmt-bold{font-weight:700}.fmt-italic{font-style:italic}.fmt-underline{text-decoration:underline}
  .linkrow{display:flex;gap:6px;align-items:flex-start}
  .linkrow .tin{margin-bottom:0}
  .colbox{border:1px solid #EEEDEA;border-radius:10px;padding:10px;margin-bottom:10px;display:flex;flex-direction:column;gap:8px}
  .colbox .seg{margin:0}
  .lib{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;max-height:220px;overflow:auto;margin-bottom:8px}
  .thumb{border:1px solid #E3E2DE;border-radius:6px;padding:0;background:#F3F2F0;cursor:pointer;height:60px;overflow:hidden}
  .thumb:hover{border-color:__ACCENT__}
  .thumb img{width:100%;height:100%;object-fit:cover;display:block}
  #bchecks{border-top:1px solid #EEEDEA;margin-top:14px;padding-top:10px;font-size:12.5px;line-height:1.45}
  #bchecks div{padding:2px 0}
  .side input:focus-visible,.side button:focus-visible,.pitem:focus-visible,.tabs button:focus-visible{outline:3px solid __ACCENT__;outline-offset:1px}
  .urbar{display:inline-flex;gap:4px;margin-right:8px}
  .ur{height:26px;padding:0 9px;border:1px solid #C9CCD1;border-radius:7px;background:#fff;font:inherit;font-size:12px;font-weight:500;letter-spacing:0;color:__INK__;cursor:pointer}
  .ur:hover:not(:disabled){border-color:__ACCENT__;color:__ACCENT_DARK__}
  .ur:disabled{color:#9AA0A6;border-color:#E3E2DE;cursor:default}
  .etools{max-height:44%}
  .etools .row1{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px}
  .etools .lab{font-size:11.5px;color:#5F6368;margin:6px 0 4px}
  .etools .seg{display:flex;flex-wrap:wrap;border:1px solid #C9CCD1;border-radius:8px;overflow:hidden}
  .etools .seg button{height:28px;border:0;border-left:1px solid #E3E2DE;background:#fff;font:inherit;font-size:12px;padding:0 9px;cursor:pointer}
  .etools .seg button:first-child{border-left:0}
  .etools .seg button[aria-pressed="true"]{background:__ACCENT_TINT__;color:__ACCENT_DARK__;font-weight:600}
  .etools input[type=text],.etools input[type=number]{height:30px;border:1px solid #C9CCD1;border-radius:8px;padding:0 8px;font:inherit;font-size:12.5px}
  .etools .b{height:30px;padding:0 12px;border-radius:15px;border:1px solid #747775;background:#fff;color:__ACCENT_DARK__;font:inherit;font-size:12.5px;font-weight:500;cursor:pointer}
  .etools .b.fill{background:__ACCENT__;border-color:__ACCENT__;color:#fff}
  .modal{position:fixed;inset:0;background:rgba(4,10,27,.55);display:flex;align-items:center;justify-content:center;padding:20px;z-index:20}
  .modal[hidden]{display:none}
  .mbox{background:#fff;border-radius:16px;padding:22px;max-width:460px}
  .mbox h3{margin:0 0 8px;font-size:17px}
  .mbox p{margin:0 0 16px;font-size:14px;line-height:1.5;color:#3C4043}
  .mbtns{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
  .drag{position:absolute}
  .stage{position:relative}
  .stage.editing iframe{max-width:820px}
  .stage.mobile.editing iframe{max-width:470px}
  .ov{position:absolute;inset:0;pointer-events:none;z-index:4;overflow:hidden}
  .ov>*{pointer-events:auto;position:absolute}
  .ov .box{pointer-events:none;border:2px solid __ACCENT__;border-radius:2px}
  .ov .badge{position:absolute;top:4px;right:4px;background:#5F6368;color:#fff;font-size:10px;font-weight:600;padding:2px 6px;border-radius:5px}
  .ov .rail{display:flex;flex-direction:column;gap:4px}
  .ov .rail button{width:30px;height:28px;border-radius:7px;border:1px solid __ACCENT__;background:#fff;color:__ACCENT__;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;box-shadow:0 1px 4px rgba(4,10,27,.12)}
  .ov .rail button:hover{background:__ACCENT_TINT__}
  .ov .rail button.grip{background:__ACCENT__;color:#fff;cursor:grab}
  .ov .rail button.on{background:__ACCENT__;color:#fff}
  .ov .rail button.del:hover{border-color:#C5221F;color:#C5221F;background:#fff}
  .ov .plus{width:26px;height:26px;border-radius:50%;border:0;background:__ACCENT__;color:#fff;font-size:18px;line-height:26px;cursor:pointer;box-shadow:0 2px 8px rgba(__ACCENT_RGB__,.4);padding:0;z-index:2}
  .ov .tb{background:#fff;border:1px solid #DADCE0;border-radius:10px;box-shadow:0 6px 24px rgba(4,10,27,.18);padding:6px;display:flex;flex-direction:column;gap:6px;font-size:12px;color:__INK__;z-index:3}
  .ov .line{display:flex;align-items:center;gap:4px;flex-wrap:nowrap;white-space:nowrap}
  .ov .line.wrap{flex-wrap:wrap;white-space:normal}
  .ov .i{min-width:28px;height:28px;border:0;border-radius:6px;background:#fff;color:__INK__;font:inherit;font-size:12.5px;cursor:pointer;padding:0 7px;display:inline-flex;align-items:center;justify-content:center;gap:5px}
  .ov .i:hover{background:#F1F3F4}
  .ov .i.on{background:__ACCENT_TINT__;color:__ACCENT_DARK__}
  .ov .sep{width:1px;height:20px;background:#E3E2DE;margin:0 2px;flex-shrink:0}
  .ov select,.ov input[type=text],.ov input[type=number]{height:28px;border:1px solid #C9CCD1;border-radius:6px;padding:0 6px;font:inherit;font-size:12px;background:#fff;color:__INK__;min-width:0}
  .ov .sw{width:16px;height:16px;border-radius:4px;border:1px solid rgba(0,0,0,.2);display:inline-block;padding:0}
  .ov .lab{font-size:10.5px;letter-spacing:.6px;color:#5F6368;font-weight:600;padding:0 4px}
  .ov .b{height:28px;padding:0 12px;border-radius:14px;border:1px solid __ACCENT__;background:#fff;color:__ACCENT_DARK__;font:inherit;font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap}
  .ov .b.fill{background:__ACCENT__;color:#fff}
  .ov .b:disabled{opacity:.45;cursor:default}
  .ov .seg{display:inline-flex;border:1px solid #C9CCD1;border-radius:7px;overflow:hidden}
  .ov .seg button{height:26px;border:0;border-left:1px solid #E3E2DE;background:#fff;font:inherit;font-size:11.5px;padding:0 8px;cursor:pointer;color:__INK__}
  .ov .seg button:first-child{border-left:0}
  .ov .seg button[aria-pressed="true"]{background:__ACCENT_TINT__;color:__ACCENT_DARK__;font-weight:600}
  .ov .seg.off{opacity:.45;pointer-events:none}
  .ov .wrapb{position:relative;display:inline-flex}
  .ov .pop{position:absolute;top:calc(100% + 6px);left:0;background:#fff;border:1px solid #DADCE0;border-radius:10px;box-shadow:0 8px 24px rgba(4,10,27,.2);padding:8px;display:grid;grid-template-columns:repeat(6,24px);gap:6px;z-index:5}
  .ov .pop .sw{width:24px;height:24px;cursor:pointer}
  .ov .pop input{grid-column:1/-1;width:100%}
  .ov .menu{background:#fff;border:1px solid #DADCE0;border-radius:12px;box-shadow:0 10px 30px rgba(4,10,27,.2);padding:8px;display:grid;grid-template-columns:1fr 1fr;gap:6px;width:300px;z-index:4}
  .ov .menu .t{grid-column:1/3;font-size:10.5px;letter-spacing:1px;color:#5F6368;padding:2px 4px;font-weight:600}
  .ov .menu button{border:1px solid #E3E2DE;border-radius:8px;background:#FCFCFA;padding:8px;font:inherit;font-size:12.5px;text-align:left;cursor:pointer;display:flex;gap:8px;align-items:center;color:__INK__}
  .ov .menu button:hover{border-color:__ACCENT__;background:__ACCENT_WASH__}
  .ov .menu button i{width:20px;height:14px;background:__ACCENT_TINT__;border-radius:3px;flex-shrink:0}
  .ov .menu button.cp{grid-column:1/3;color:__ACCENT_DARK__;background:__ACCENT_WASH__;border-color:__ACCENT_LINE__}
  .ov .menu small{grid-column:1/3;color:#80868B;font-size:11px;padding:0 4px;line-height:1.4}
  .ov .dl{height:4px;background:__ACCENT__;border-radius:2px;pointer-events:none;box-shadow:0 0 0 2px rgba(__ACCENT_RGB__,.25)}
  .ov .libgrid{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;max-height:150px;overflow:auto}
  .ov .libgrid button{height:46px;padding:0;border:1px solid #E3E2DE;border-radius:6px;overflow:hidden;cursor:pointer;background:#F3F2F0}
  .ov .libgrid button:hover{border-color:__ACCENT__}
  .ov .libgrid img{width:100%;height:100%;object-fit:cover;display:block}
  .ov .note{font-size:11.5px;color:#5F6368;white-space:normal;line-height:1.4}
  .cover{position:absolute;inset:0;z-index:6;cursor:grabbing}
  .ehint{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12.5px;color:#3C4043;line-height:1.45}
  .ehint .b{height:28px;padding:0 12px;border-radius:14px;border:1px solid __ACCENT__;background:#fff;color:__ACCENT_DARK__;font:inherit;font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap}
  .ehint.bad{color:#7a1c14;background:#FDECEA;border-radius:8px;padding:8px 10px}
  @media (max-width:900px){.main{grid-template-columns:1fr;grid-template-rows:1fr 1fr}.f input{width:200px}.bmain{grid-template-columns:1fr}}
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
    <button class="btn" id="save" type="button">Save and check</button>
    <button class="btn fill" id="publish" type="button">Publish for everyone</button>
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

  <div class="modal" id="switchBox" role="dialog" aria-modal="true" aria-labelledby="switchTitle" hidden>
    <div class="mbox">
      <h3 id="switchTitle"></h3>
      <p id="switchText"></p>
      <div class="mbtns" id="switchBtns"></div>
    </div>
  </div>

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

  function setStatus() {
    var s = $('status');
    var label = t.status === 'published' ? (t.hasUnpublishedChanges ? 'Published · changes not live' : 'Published · live')
      : t.status === 'unpublished' ? 'Unpublished' : t.status === 'draft' ? 'Draft · admins only' : 'Not saved yet';
    if (dirty()) label += ' · unsaved edits';
    s.textContent = label;
    s.className = 'status' + (t.status === 'published' && !t.hasUnpublishedChanges && !dirty() ? ' live' : t.status === 'new' ? '' : ' draft');
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
      b.textContent = c.level === 'error' ? 'Fix: ' : c.level === 'warn' ? 'Check: ' : '✓ ';
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
      t.status = 'published'; t.hasUnpublishedChanges = false; setStatus();
      toast('Published (v' + r.version + '). Everyone can use it now. Go back to the Gmail tab and click Refresh.');
    }).catch(function (e) {
      if (e.data && e.data.conflict) { showConflict(e.data.conflict, function () { publish(true); }); return; }
      if (e.data && e.data.checks) showChecks(e.data.checks);
      toast(e.message, true);
    }).then(function () { lock(false); });
  }

  $('save').addEventListener('click', function () { save(false); });
  $('publish').addEventListener('click', function () { publish(false); });
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
