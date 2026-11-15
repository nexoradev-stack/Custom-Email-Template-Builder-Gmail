'use strict';

/**
 * Brand settings. Every page and editor of the engine is painted with these,
 * so one deployment can carry your company's name, website, logo and colours
 * without changing the code. Set them as environment variables (see
 * env.example.yaml). The defaults are a vibrant, neutral demo theme.
 */

const env = (k, d) => (process.env[k] && String(process.env[k]).trim()) || d;
const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || '').trim()) ? String(v).trim().toUpperCase() : d);

function rgb(h) {
  const n = parseInt(h.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/** Mixes a colour with white (amount 0..1 of the colour kept). */
function tint(h, keep) {
  const [r, g, b] = rgb(h).split(',').map(Number);
  const m = (c) => Math.round(255 - (255 - c) * keep);
  return '#' + [m(r), m(g), m(b)].map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Darkens a colour (amount 0..1 kept). */
function shade(h, keep) {
  const [r, g, b] = rgb(h).split(',').map(Number);
  return '#' + [r, g, b].map((c) => Math.round(c * keep).toString(16).padStart(2, '0')).join('').toUpperCase();
}

const ink = hex(env('BRAND_INK'), '#17123B');        /* dark: header band, main text */
const accent = hex(env('BRAND_ACCENT'), '#6C3BFF');  /* buttons, links, selection */
const soft = hex(env('BRAND_SOFT'), '#EDE8FF');      /* footer rows, quiet backgrounds */
const page = hex(env('BRAND_PAGE'), '#F8F7FC');      /* page background */

const theme = {
  appName: env('APP_NAME', 'Template Gallery'),
  brandName: env('BRAND_NAME', 'Acme'),
  website: env('BRAND_WEBSITE', 'https://www.example.com'),
  logoUrl: env('BRAND_LOGO_URL', '/assets/logo-mark.png'),
  ink,
  accent,
  accentDark: shade(accent, 0.84),
  accentTint: tint(accent, 0.12),
  accentWash: tint(accent, 0.05),
  accentLine: tint(accent, 0.3),
  accentLight: tint(accent, 0.55),
  soft,
  page,
  /* extra brand swatches shown first in colour pickers */
  swatches: [ink, accent, soft, '#FFFFFF', page, '#F1F3F4', '#111111', '#3C4043', '#5F6368', '#FF5C7A', '#19C7A6', '#FFB547']
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jsStr = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/</g, '\\x3c');

/** Fills the brand tokens in a page (HTML, CSS and the editor scripts inside it). */
function applyTheme(html) {
  return String(html)
    .replace(/__INK__/g, theme.ink)
    .replace(/__ACCENT_DARK__/g, theme.accentDark)
    .replace(/__ACCENT_TINT__/g, theme.accentTint)
    .replace(/__ACCENT_WASH__/g, theme.accentWash)
    .replace(/__ACCENT_LINE__/g, theme.accentLine)
    .replace(/__ACCENT_LIGHT__/g, theme.accentLight)
    .replace(/__ACCENT_RGB__/g, rgb(theme.accent))
    .replace(/__ACCENT__/g, theme.accent)
    .replace(/__SOFT__/g, theme.soft)
    .replace(/__PAGE__/g, theme.page)
    .replace(/__SWATCHES__/g, JSON.stringify(theme.swatches))
    .replace(/__APP__/g, esc(theme.appName))
    .replace(/__BRAND_JS__/g, jsStr(theme.brandName))
    .replace(/__BRAND__/g, esc(theme.brandName))
    .replace(/__SITE_JS__/g, jsStr(theme.website))
    .replace(/__SITE__/g, esc(theme.website))
    .replace(/__LOGO__/g, esc(theme.logoUrl));
}

module.exports = { theme, applyTheme, tint, shade };
