'use strict';

/**
 * The 1 MB image limit, shared by the server and every upload screen.
 * Too-big images get a red message with "Reduce it here" (our image reducer page)
 * and a link to Google Squoosh.
 */

const cfg = require('./config');

const MAX = cfg.maxImageBytes;
const REDUCER_PATH = '/reducer';
const SQUOOSH_URL = 'https://squoosh.app/';

/** "3.4 MB" or "820 KB" */
function sizeText(bytes) {
  const n = Number(bytes) || 0;
  return n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

function tooBigMessage(bytes) {
  return bytes ? `This image is ${sizeText(bytes)}. The limit is 1 MB.` : 'This image is over 1 MB. The limit is 1 MB.';
}

/** An error the upload routes throw; the screens show the red "Reduce it here" box for it. */
function tooBigError(httpError, bytes) {
  return httpError(413, `${tooBigMessage(bytes)} Make it smaller with the image reducer, then upload it again.`, { tooBig: true, size: bytes || null });
}

/*
 * Browser code (put inside a <script>). Defines window.IMGLIMIT:
 *   IMGLIMIT.max                 1 MB in bytes
 *   IMGLIMIT.hint(text?)         grey line "JPG, PNG, WebP or GIF · up to 1 MB"
 *   IMGLIMIT.box(bytes, extra?)  red box with "Reduce it here ↗" and "or use Google Squoosh"
 *   IMGLIMIT.show(parent, bytes, after?, extra?)  puts the red box in place (replacing an old one)
 *   IMGLIMIT.clear(parent)       removes it
 */
const CLIENT = `
(function () {
  var MAX = ${MAX};
  function size(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function hint(text) {
    var d = document.createElement('div');
    d.className = 'imglimit-hint';
    d.style.cssText = 'font-size:11.5px;color:#5F6368;line-height:1.4;white-space:normal;margin:2px 0';
    d.textContent = text || 'JPG, PNG, WebP or GIF \\u00b7 up to 1 MB';
    return d;
  }
  function box(bytes, extra) {
    var d = document.createElement('div');
    d.className = 'imglimit-box';
    d.setAttribute('role', 'alert');
    d.style.cssText = 'background:#FDECEA;border:1px solid #F5B7B1;border-radius:8px;padding:9px 11px;font-size:12px;line-height:1.5;color:#7A1C14;white-space:normal;display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:4px 0;font-family:inherit';
    var t = document.createElement('span');
    t.style.cssText = 'flex:1;min-width:200px';
    var b = document.createElement('b');
    b.textContent = '\\u26a0 ' + (bytes ? 'This image is ' + size(bytes) + '. The limit is 1 MB.' : 'This image is over 1 MB. The limit is 1 MB.');
    t.appendChild(b);
    t.appendChild(document.createElement('br'));
    t.appendChild(document.createTextNode(extra || 'Reduce it, download the smaller copy, then upload it here.'));
    var go = document.createElement('a');
    go.href = '${REDUCER_PATH}';
    go.target = '_blank';
    go.rel = 'noopener';
    go.textContent = 'Reduce it here \\u2197';
    go.style.cssText = 'background:#C5221F;color:#fff;border-radius:14px;padding:6px 14px;font-weight:700;text-decoration:none;white-space:nowrap';
    var sq = document.createElement('a');
    sq.href = '${SQUOOSH_URL}';
    sq.target = '_blank';
    sq.rel = 'noopener';
    sq.textContent = 'or use Google Squoosh';
    sq.style.cssText = 'color:#7A1C14;text-decoration:underline;white-space:nowrap';
    d.appendChild(t); d.appendChild(go); d.appendChild(sq);
    return d;
  }
  function clear(parent) {
    if (!parent) return;
    var old = parent.querySelectorAll('.imglimit-box');
    for (var i = 0; i < old.length; i++) old[i].remove();
  }
  function show(parent, bytes, after, extra) {
    clear(parent);
    var b = box(bytes, extra);
    if (after && after.parentNode) after.parentNode.insertBefore(b, after.nextSibling);
    else if (parent) parent.insertBefore(b, parent.firstChild);
    return b;
  }
  window.IMGLIMIT = { max: MAX, size: size, hint: hint, box: box, show: show, clear: clear };
})();
`;

module.exports = { MAX, REDUCER_PATH, SQUOOSH_URL, sizeText, tooBigMessage, tooBigError, CLIENT };
