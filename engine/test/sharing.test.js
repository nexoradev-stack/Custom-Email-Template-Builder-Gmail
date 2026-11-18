'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { accessFor, sharedList, usableHtml, cleanShareList } = require('../src/sharing');
const { processTemplate } = require('../src/pipeline');

const ankita = { email: 'ankita@acme-corp.io' };
const other = { email: 'someone@acme-corp.io' };
const at = { toDate: () => new Date() };

test('a draft shared with Ankita is only for Ankita', () => {
  const d = { status: 'draft', sharedWith: ['ankita@acme-corp.io'], sharedAt: at, sharedHtml: '<p>for Ben</p>', draftHtml: '<p>newer</p>' };
  assert.strictEqual(accessFor(d, ankita), 'shared');
  assert.strictEqual(accessFor({ ...d }, { email: 'ANKITA@acme-corp.io' }), 'shared');
  assert.strictEqual(accessFor(d, other), null);
  assert.strictEqual(usableHtml(d, 'shared'), '<p>for Ben</p>', 'she gets the fixed copy, not the newer draft');
});

test('a plain draft is for nobody; a published template is for everyone', () => {
  assert.strictEqual(accessFor({ status: 'draft' }, ankita), null);
  assert.strictEqual(accessFor({ status: 'unpublished', publishedHtml: '<p>x</p>' }, ankita), null);
  assert.strictEqual(accessFor({ status: 'published', publishedHtml: '<p>x</p>' }, other), 'published');
});

test('once published, the named list no longer matters', () => {
  const d = { status: 'published', publishedHtml: '<p>all</p>', sharedWith: ['ankita@acme-corp.io'], sharedAt: at, sharedHtml: '<p>old</p>' };
  assert.deepStrictEqual(sharedList(d), []);
  assert.strictEqual(accessFor(d, ankita), 'published');
  assert.strictEqual(usableHtml(d, 'published'), '<p>all</p>');
});

test('a list without a shared copy gives no access', () => {
  assert.strictEqual(accessFor({ status: 'draft', sharedWith: ['ankita@acme-corp.io'] }, ankita), null);
});

test('share list: only company addresses, no repeats, a limit', () => {
  assert.deepStrictEqual(cleanShareList([' Ankita@acme-corp.io ', 'ankita@acme-corp.io', ''], 'acme-corp.io', 25), ['ankita@acme-corp.io']);
  assert.throws(() => cleanShareList(['ben@gmail.com'], 'acme-corp.io', 25), /Only acme-corp.io addresses/);
  assert.throws(() => cleanShareList(['not an email'], 'acme-corp.io', 25), /not an email address/);
  assert.throws(() => cleanShareList(['a@acme-corp.io.evil.io'], 'acme-corp.io', 25), /Only acme-corp.io/);
  const many = Array.from({ length: 26 }, (v, i) => `p${i}@acme-corp.io`);
  assert.throws(() => cleanShareList(many, 'acme-corp.io', 25), /up to 25 people/);
  assert.deepStrictEqual(cleanShareList(null), []);
});

test('the Gmail check counts the links (information only)', () => {
  const html = '<table><tr><td><a href="https://www.acme-corp.io">A</a> <a href="https://www.acme-corp.io/b">B</a> <a href="#">dead</a> <a href="mailto:x@acme-corp.io">mail</a></td></tr></table>';
  const out = processTemplate(html);
  const info = out.checks.find((c) => c.code === 'link_count');
  assert.strictEqual(info.level, 'info');
  assert.strictEqual(info.message, 'This template has 3 links.');
  assert.strictEqual(out.checks[out.checks.length - 1].code, 'link_count', 'shown last');
  assert.ok(!out.hasErrors);
  assert.strictEqual(processTemplate('<p>No links here</p>').checks.find((c) => c.code === 'link_count').message, 'This template has no links.');
  assert.strictEqual(processTemplate('<p><a href="https://x.io">one</a></p>').checks.find((c) => c.code === 'link_count').message, 'This template has 1 link.');
});
