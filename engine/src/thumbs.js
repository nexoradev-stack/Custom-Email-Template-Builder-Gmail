'use strict';

/**
 * Takes a screenshot of a template so the gallery can show a thumbnail.
 * Runs Chromium inside the Cloud Run container. JavaScript is switched off and
 * only https images are allowed to load, so template code can't do anything else.
 */

let puppeteer = null;
try {
  puppeteer = require('puppeteer-core');
} catch (e) {
  puppeteer = null;
}

const CHROME = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
let browserPromise = null;

async function getBrowser() {
  if (!puppeteer) throw new Error('Thumbnail renderer is not installed.');
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote', '--single-process', '--hide-scrollbars']
    }).catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

const FRAME_W = 680;
const FRAME_H = 360;

/** Returns a PNG buffer (2x scale) showing the top of the email. */
async function renderThumbnail(html) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (req.resourceType() === 'document' && url === 'about:blank') return req.continue();
      if (req.resourceType() === 'image' && /^https:\/\//i.test(url)) return req.continue();
      if (/^data:/i.test(url)) return req.continue();
      return req.abort();
    });
    await page.setViewport({ width: FRAME_W, height: FRAME_H, deviceScaleFactor: 2 });
    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;background:#F3F2F0;overflow:hidden}
      .email{width:600px;margin:24px auto 0;background:#FFFFFF;box-shadow:0 1px 3px rgba(4,10,27,.08)}
    </style></head><body><div class="email">${html}</div></body></html>`;
    await page.setContent(doc, { waitUntil: 'load', timeout: 8000 }).catch(() => {});
    return await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: FRAME_W, height: FRAME_H } });
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { renderThumbnail };
