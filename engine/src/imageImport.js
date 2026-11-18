'use strict';

/**
 * Copy into library: fetches a picture from another public website (for example
 * events.example.com) so it can be kept in the image library.
 *
 * Safety: only https links, only public internet addresses (never the server's
 * own network), at most 3 redirects, at most 1 MB, 10 seconds, images only.
 */

const dns = require('dns').promises;
const net = require('net');

const { MAX, tooBigMessage } = require('./imageLimit');

const MAX_BYTES = MAX;
const TIMEOUT_MS = 10000;

class ImportError extends Error {
  constructor(status, message, size) { super(message); this.status = status; this.size = size || null; }
}

/** True for addresses that are not on the public internet. */
function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    return p[0] === 10 || p[0] === 127 || p[0] === 0 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
      p[0] >= 224;
  }
  const v = ip.toLowerCase();
  if (v === '::1' || v === '::') return true;
  if (v.startsWith('::ffff:')) return isPrivate(v.slice(7));
  return v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb');
}

async function checkUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch (e) { throw new ImportError(400, 'This image link could not be read.'); }
  if (u.protocol !== 'https:') throw new ImportError(400, 'Only https image links can be copied into the library.');
  if (u.username || u.password) throw new ImportError(400, 'This image link could not be used.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  let addrs;
  try {
    addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  } catch (e) {
    throw new ImportError(400, 'The website for this image could not be found.');
  }
  if (!addrs.length || addrs.some((a) => isPrivate(a.address))) throw new ImportError(400, 'This image link points to a private network and cannot be copied.');
  return u;
}

/** Downloads an image. Returns { buffer, name } where name is taken from the link. */
async function fetchImage(raw, fetchImpl = fetch) {
  let u = await checkUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetchImpl(u.href, { redirect: 'manual', signal: ctrl.signal, headers: { Accept: 'image/*' } });
    } catch (e) {
      clearTimeout(timer);
      throw new ImportError(502, 'The image could not be downloaded from that website. Download it and use Upload instead.');
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      clearTimeout(timer);
      if (hop === 3) throw new ImportError(502, 'That image link redirects too many times.');
      u = await checkUrl(new URL(res.headers.get('location'), u).href);
      continue;
    }
    if (!res.ok) {
      clearTimeout(timer);
      throw new ImportError(502, `That website did not send the image (error ${res.status}). Download it and use Upload instead.`);
    }
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_BYTES) { clearTimeout(timer); throw new ImportError(413, tooBigMessage(len), len); }
    const chunks = [];
    let total = 0;
    try {
      for await (const chunk of res.body) {
        total += chunk.length;
        if (total > MAX_BYTES) throw new ImportError(413, tooBigMessage(0));
        chunks.push(Buffer.from(chunk));
      }
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof ImportError) throw e;
      throw new ImportError(502, 'The image could not be downloaded completely. Try again.');
    }
    clearTimeout(timer);
    const name = decodeURIComponent(u.pathname.split('/').pop() || 'image').slice(0, 80) || 'image';
    return { buffer: Buffer.concat(chunks), name };
  }
  throw new ImportError(502, 'That image link redirects too many times.');
}

module.exports = { fetchImage, isPrivate, ImportError };
