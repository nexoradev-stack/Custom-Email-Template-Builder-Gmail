'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { fetchImage, isPrivate } = require('../src/imageImport');

test('private and local addresses are refused', () => {
  ['10.0.0.1', '127.0.0.1', '169.254.169.254', '172.16.5.4', '192.168.1.1', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1'].forEach((ip) => assert.ok(isPrivate(ip), ip));
  ['8.8.8.8', '142.250.72.14', '2607:f8b0:4005:80b::200e'].forEach((ip) => assert.ok(!isPrivate(ip), ip));
});

test('only https links', async () => {
  await assert.rejects(fetchImage('http://example.com/a.jpg'), /Only https/);
  await assert.rejects(fetchImage('https://169.254.169.254/latest'), /private network/);
});

test('a redirect to a private address is refused', async () => {
  const fake = async () => ({ status: 302, ok: false, headers: new Map([['location', 'https://127.0.0.1/secret']]) });
  await assert.rejects(fetchImage('https://8.8.8.8/a.jpg', fake), /private network/);
});

test('downloads an image and keeps its file name', async () => {
  const body = (async function* () { yield Buffer.from([0xff, 0xd8, 0xff, 1, 2]); })();
  const fake = async () => ({ status: 200, ok: true, headers: new Map([['content-length', '5']]), body });
  const out = await fetchImage('https://8.8.8.8/pics/hero%20one.jpg', fake);
  assert.strictEqual(out.name, 'hero one.jpg');
  assert.strictEqual(out.buffer.length, 5);
});

test('images over 10 MB are refused', async () => {
  const fake = async () => ({ status: 200, ok: true, headers: new Map([['content-length', String(11 * 1024 * 1024)]]), body: [] });
  await assert.rejects(fetchImage('https://8.8.8.8/big.jpg', fake), /over 10 MB/);
});
