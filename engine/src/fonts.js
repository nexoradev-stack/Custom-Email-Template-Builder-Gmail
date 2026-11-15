'use strict';

/**
 * Fonts admins can choose in the editor. One list, A to Z.
 *
 * Every font has a backup (the rest of its stack). Gmail cannot send
 * downloadable fonts, so fonts marked web: true only show on computers and
 * phones where that font is installed; everyone else sees the backup.
 */

const FONTS = [
  { name: 'Arial', stack: 'Arial, Helvetica, sans-serif' },
  { name: 'Arial Black', stack: "'Arial Black', Arial, sans-serif" },
  { name: 'Barlow', stack: 'Barlow, Arial, sans-serif', web: true },
  { name: 'Book Antiqua', stack: "'Book Antiqua', Palatino, Georgia, serif" },
  { name: 'Calibri', stack: 'Calibri, Arial, sans-serif' },
  { name: 'Cambria', stack: 'Cambria, Georgia, serif' },
  { name: 'Century Gothic', stack: "'Century Gothic', Verdana, sans-serif" },
  { name: 'Courier New', stack: "'Courier New', Courier, monospace" },
  { name: 'DM Sans', stack: "'DM Sans', Arial, sans-serif", web: true },
  { name: 'Garamond', stack: 'Garamond, Georgia, serif' },
  { name: 'Georgia', stack: 'Georgia, serif' },
  { name: 'Helvetica', stack: 'Helvetica, Arial, sans-serif' },
  { name: 'IBM Plex Mono', stack: "'IBM Plex Mono', 'Courier New', monospace", web: true },
  { name: 'Impact', stack: "Impact, 'Arial Black', sans-serif" },
  { name: 'Inter', stack: 'Inter, Arial, sans-serif', web: true },
  { name: 'Lato', stack: 'Lato, Arial, sans-serif', web: true },
  { name: 'Lexend', stack: 'Lexend, Verdana, sans-serif', web: true },
  { name: 'Lora', stack: 'Lora, Georgia, serif', web: true },
  { name: 'Lucida Sans', stack: "'Lucida Sans', 'Lucida Grande', 'Lucida Sans Unicode', Arial, sans-serif" },
  { name: 'Manrope', stack: 'Manrope, Arial, sans-serif', web: true },
  { name: 'Merriweather', stack: 'Merriweather, Georgia, serif', web: true },
  { name: 'Montserrat', stack: 'Montserrat, Verdana, sans-serif', web: true },
  { name: 'Noto Sans', stack: "'Noto Sans', Arial, sans-serif", web: true },
  { name: 'Nunito', stack: 'Nunito, Arial, sans-serif', web: true },
  { name: 'Open Sans', stack: "'Open Sans', Arial, sans-serif", web: true },
  { name: 'Palatino', stack: "Palatino, 'Palatino Linotype', 'Book Antiqua', Georgia, serif" },
  { name: 'Playfair Display', stack: "'Playfair Display', Georgia, serif", web: true },
  { name: 'Plus Jakarta Sans', stack: "'Plus Jakarta Sans', Arial, sans-serif", web: true },
  { name: 'Poppins', stack: 'Poppins, Verdana, sans-serif', web: true },
  { name: 'Raleway', stack: 'Raleway, Arial, sans-serif', web: true },
  { name: 'Roboto', stack: 'Roboto, Arial, sans-serif', web: true },
  { name: 'Rubik', stack: 'Rubik, Arial, sans-serif', web: true },
  { name: 'Segoe UI', stack: "'Segoe UI', Tahoma, Arial, sans-serif" },
  { name: 'Source Sans', stack: "'Source Sans 3', 'Source Sans Pro', Arial, sans-serif", web: true },
  { name: 'Tahoma', stack: 'Tahoma, Verdana, sans-serif' },
  { name: 'Times New Roman', stack: "'Times New Roman', Times, serif" },
  { name: 'Trebuchet MS', stack: "'Trebuchet MS', Arial, sans-serif" },
  { name: 'Verdana', stack: 'Verdana, sans-serif' },
  { name: 'Work Sans', stack: "'Work Sans', Arial, sans-serif", web: true }
];

const firstFamily = (stack) => String(stack || '').split(',')[0].replace(/["']/g, '').trim().toLowerCase();

const byKey = new Map();
FONTS.forEach((f) => {
  byKey.set(f.name.toLowerCase(), f);
  byKey.set(firstFamily(f.stack), f);
});

/** The font from our list that a CSS font-family value asks for, or null. */
function findFont(value) {
  return byKey.get(firstFamily(value)) || null;
}

/** What most people see for a font (its first backup that is not a downloadable font). */
function backupName(font) {
  if (!font || !font.web) return font ? font.name : 'Arial';
  const parts = font.stack.split(',').map((p) => p.replace(/["']/g, '').trim());
  return parts.find((p, i) => i > 0 && !/^(sans-serif|serif|monospace)$/.test(p)) || 'Arial';
}

module.exports = { FONTS, findFont, backupName };
