'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { processTemplate, classifyImageUrl, parseStyle } = require('../src/pipeline');

const LIB = 'https://storage.googleapis.com/your-image-bucket/';

const PARDOT = `<!DOCTYPE html><html><head><title>x</title>
<style>
  .headline { font-size: 32px; font-family: 'Saans','Inter','Segoe UI',Arial,sans-serif; }
  @media (max-width:600px){ .container{width:100% !important} }
</style></head>
<body>
<div style="display:none;font-family:'MD IO',Courier New">Preheader text</div>
<table class="container" pardot-data="" width="600" style="width:600px;background:#FFFFFF">
  <tr><td style="background:#17123B;padding:32px 40px">
    <a href="https://www.example.com/"><img src="${LIB}logo.png" width="130" alt="Acme"></a>
  </td></tr>
  <tr><td class="headline" style="padding:28px 40px 0 40px">Thank you</td></tr>
  <tr><td style="font-family:'Saans',Arial;font-size:15px !important">Hi {{Recipient.FirstName}},
    <a href="#">Survey</a> <a href="{{Unsubscribe}}">Unsubscribe</a></td></tr>
</table>
<script>alert(1)</script>
</body></html>`;

test('pipeline makes Pardot HTML Gmail-ready', () => {
  const r = processTemplate(PARDOT);
  assert.strictEqual(r.hasErrors, false);
  assert.ok(!/<style|<script|<head|<title/i.test(r.html));
  assert.ok(!/Preheader text/.test(r.html), 'hidden preheader removed');
  assert.ok(!/pardot-data|class=/.test(r.html));
  assert.ok(!/Saans|Segoe|Inter/.test(r.html), 'fonts replaced');
  assert.ok(/font-size:32px/.test(r.html), 'class CSS inlined');
  assert.ok(/width:100%/.test(r.html) && /max-width:600px/.test(r.html), 'fluid width');
  assert.ok(/width="100%"/.test(r.html));
  assert.ok(!/!important/.test(r.html));
  assert.ok(r.html.startsWith('<div style="font-family:Arial, Helvetica, sans-serif">'));
  const codes = r.checks.map((c) => c.code);
  for (const c of ['css_inlined', 'font', 'size', 'images', 'dead_links', 'merge_tags', 'media_queries', 'hidden_removed']) {
    assert.ok(codes.includes(c), `missing check ${c}`);
  }
});

test('blocked image stops publishing', () => {
  const r = processTemplate('<table><tr><td><img src="data:image/png;base64,AAAA" alt="x"></td></tr></table>');
  assert.strictEqual(r.hasErrors, true);
  assert.ok(r.checks.some((c) => c.code === 'image_blocked'));
});

test('outside image only warns; flex warns', () => {
  const r = processTemplate('<div style="display:flex"><img src="https://www.acme-corp.io/a.png"></div>');
  assert.strictEqual(r.hasErrors, false);
  const codes = r.checks.map((c) => c.code);
  assert.ok(codes.includes('image_outside') && codes.includes('flex_grid') && codes.includes('alt'));
});

test('oversize output is an error', () => {
  const r = processTemplate(`<table><tr><td>${'x'.repeat(110 * 1024)}</td></tr></table>`);
  assert.ok(r.checks.some((c) => c.code === 'too_big' && c.level === 'error'));
});

test('empty input is an error', () => {
  assert.strictEqual(processTemplate('   ').hasErrors, true);
});

test('image link classification', () => {
  const lvl = (u) => classifyImageUrl(u).level;
  assert.strictEqual(lvl(`${LIB}hero.png`), 'ok');
  assert.strictEqual(lvl('https://www.acme-corp.io/hero.png'), 'warn');
  assert.strictEqual(lvl('https://events.acme-corp.io/l/1089002/x/logo.png'), 'warn');
  assert.strictEqual(lvl('http://www.example-site.io/hero.png'), 'warn');
  for (const bad of [
    '', 'images/hero.png', './a.png', 'file:///C:/a.png', 'blob:https://www.figma.com/6f1c',
    'data:image/png;base64,AA', 'https://www.figma.com/design/AbC/x?node-id=1-2',
    'https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/abc',
    'https://drive.google.com/uc?id=1AbC', 'https://photos.app.goo.gl/AbC',
    'https://www.dropbox.com/s/abc/hero.png?dl=0', 'https://acme.sharepoint.com/:i:/r/x',
    'https://files.slack.com/files-pri/T0/hero.png', 'http://localhost:3000/a.png',
    'http://192.168.1.20/a.png', 'https://via.placeholder.com/600x300', 'https://placehold.co/600x300',
    'https://example.com/hero.jpg', 'https://www.industrialempathy.com/img/blurry.svg',
    'https://storage.googleapis.com/b/h.png?X-Goog-Expires=3600&X-Goog-Signature=abc'
  ]) assert.strictEqual(lvl(bad), 'error', bad);
});

test('style parser keeps urls with semicolons-free parens and strips !important', () => {
  const d = parseStyle("background:url('https://a.b/c.png');width:600px !important; font-family:'A B', Arial");
  assert.deepStrictEqual(d[1], ['width', '600px']);
  assert.strictEqual(d.length, 3);
});

/* ---------- categories ---------- */

const cats = require('../src/categories');

test('categories: defaults, switch on/off, add, and bad names', () => {
  const start = cats.normalise(null);
  assert.deepStrictEqual(start.filter((c) => c.visible).map((c) => c.name), ['Sales', 'Newsletters', 'HR']);
  assert.strictEqual(cats.isVisible(start, 'events'), false);

  const next = cats.applyChanges(start, { visible: ['Events', 'sales'], add: 'Partners' });
  assert.deepStrictEqual(next.filter((c) => c.visible).map((c) => c.name), ['Events', 'Sales'], 'a new category starts as admins only');
  assert.strictEqual(next.length, start.length + 1, 'nothing is ever removed');

  assert.throws(() => cats.applyChanges(next, { add: 'partners' }), /already exists/);
  assert.throws(() => cats.applyChanges(next, { add: '<b>x</b>' }), /Use only/);
  assert.throws(() => cats.applyChanges(next, { add: 'All' }), /already there/);
  assert.deepStrictEqual(cats.applyChanges(next, {}), next, 'no changes keeps the list');
});

test('plain text is refused, so a template can never be saved without its code', () => {
  const r = processTemplate('Test Template Acme This is a test template Hi there');
  assert.strictEqual(r.hasErrors, true);
  assert.strictEqual(r.checks[0].code, 'not_html');
  assert.strictEqual(processTemplate('<table><tr><td>Hi</td></tr></table>').hasErrors, false);
});

/* ---------- blocks for the Customise window ---------- */

const { markBlocks, cleanForEmail, cleanLocks } = require('../src/blocks');

test('blocks: images and text cells get stable ids, and are removed before emailing', () => {
  const html = processTemplate('<table><tr><td><img src="x.jpg" alt="Hero"></td></tr><tr><td>Hello <b>there</b><br>friend</td></tr><tr><td><div>One</div><div>Two</div></td></tr></table>').html;
  const a = markBlocks(html);
  assert.deepStrictEqual(a.blocks.map((b) => b.id), ['i0', 't0', 't1', 't2']);
  assert.deepStrictEqual(markBlocks(html).blocks, a.blocks, 'same code, same ids');
  assert.strictEqual(cleanForEmail(a.html), html);
  assert.deepStrictEqual(cleanLocks(['t1', 'zz', 't1'], a.blocks), ['t1']);
});

test('cleanForEmail removes editing leftovers and anything unsafe', () => {
  const out = cleanForEmail('<div contenteditable="true" spellcheck="true" class="sel" onclick="x()" data-b="t0">Hi<script>alert(1)</script></div><a href="javascript:alert(1)">x</a>');
  assert.ok(!/contenteditable|spellcheck|class=|onclick|data-b|script|javascript/i.test(out), out);
});

test('categories: one switch at a time never touches the others; rename and remove', () => {
  const start = cats.normalise(null);
  const on = cats.applyChanges(start, { set: { name: 'events', visible: true } });
  assert.deepStrictEqual(on.filter((c) => c.visible).map((c) => c.name), ['Events', 'Sales', 'Newsletters', 'HR']);
  const off = cats.applyChanges(on, { set: { name: 'Sales', visible: false } });
  assert.deepStrictEqual(off.filter((c) => c.visible).map((c) => c.name), ['Events', 'Newsletters', 'HR']);
  const renamed = cats.applyChanges(off, { rename: { from: 'hr', to: 'People' } });
  assert.ok(renamed.some((c) => c.name === 'People' && c.visible));
  assert.throws(() => cats.applyChanges(off, { rename: { from: 'HR', to: 'sales' } }), /already exists/);
  const removed = cats.applyChanges(renamed, { remove: { name: 'General' } });
  assert.ok(!removed.some((c) => c.name === 'General'));
  assert.throws(() => cats.applyChanges([{ name: 'Only', visible: true }], { remove: { name: 'Only' } }), /at least one/);
});
