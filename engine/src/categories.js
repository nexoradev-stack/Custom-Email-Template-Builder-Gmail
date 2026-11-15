'use strict';

/**
 * Categories: which ones exist, and which ones users can see.
 * Admins switch a category on or off for users and can add new ones.
 * A category is never deleted here, only hidden, so no template loses its category.
 */

const cfg = require('./config');
const { httpError } = require('./auth');

const MAX_CATEGORIES = 20;

function defaults() {
  const visible = cfg.defaultVisibleCategories.map((c) => c.toLowerCase());
  return cfg.categories.map((name) => ({ name, visible: visible.includes(name.toLowerCase()) }));
}

/** Cleans what is stored in the database; falls back to the defaults. */
function normalise(stored) {
  const list = Array.isArray(stored) ? stored : [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const name = String((item && item.name) || '').replace(/\s+/g, ' ').trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push({ name, visible: Boolean(item.visible) });
  }
  return out.length ? out : defaults();
}

function cleanNewName(v) {
  const name = String(v || '').replace(/\s+/g, ' ').trim();
  if (!name) throw httpError(400, 'Enter a category name.');
  if (name.length > 24) throw httpError(400, 'Category name must be 24 characters or fewer.');
  if (!/^[A-Za-z0-9][A-Za-z0-9 &/+-]*$/.test(name)) throw httpError(400, 'Use only letters, numbers, spaces and & / + - in a category name.');
  if (name.toLowerCase() === 'all') throw httpError(400, '"All" is already there. Choose another name.');
  return name;
}

/**
 * Applies an admin's changes to the current list.
 * - visible: names that should be switched on for users (everything else is switched off)
 * - add: optional new category name (starts switched on)
 */
function applyChanges(current, changes) {
  const body = changes || {};
  let list = current.map((c) => ({ name: c.name, visible: c.visible }));

  if (Array.isArray(body.visible)) {
    const on = new Set(body.visible.map((v) => String(v).trim().toLowerCase()));
    list = list.map((c) => ({ name: c.name, visible: on.has(c.name.toLowerCase()) }));
  }

  /* One category switched on or off: never touches the others. */
  if (body.set && typeof body.set === 'object') {
    const hit = findCategory(list, body.set.name);
    if (!hit) throw httpError(404, 'That category no longer exists. Click Refresh.');
    list = list.map((c) => (c.name === hit.name ? { name: c.name, visible: Boolean(body.set.visible) } : c));
  }

  if (body.rename && typeof body.rename === 'object') {
    const hit = findCategory(list, body.rename.from);
    if (!hit) throw httpError(404, 'That category no longer exists. Click Refresh.');
    const to = cleanNewName(body.rename.to);
    if (to.toLowerCase() !== hit.name.toLowerCase() && findCategory(list, to)) throw httpError(409, `A category called "${to}" already exists.`);
    list = list.map((c) => (c.name === hit.name ? { name: to, visible: c.visible } : c));
  }

  if (body.remove && typeof body.remove === 'object') {
    const hit = findCategory(list, body.remove.name);
    if (!hit) throw httpError(404, 'That category no longer exists. Click Refresh.');
    if (list.length <= 1) throw httpError(400, 'Keep at least one category.');
    list = list.filter((c) => c.name !== hit.name);
  }

  if (body.add !== undefined && String(body.add).trim() !== '') {
    const name = cleanNewName(body.add);
    if (list.some((c) => c.name.toLowerCase() === name.toLowerCase())) throw httpError(409, `A category called "${name}" already exists.`);
    if (list.length >= MAX_CATEGORIES) throw httpError(400, `You can have up to ${MAX_CATEGORIES} categories.`);
    list.push({ name, visible: true });
  }
  return list;
}

function findCategory(list, value) {
  const key = String(value || '').trim().toLowerCase();
  return list.find((c) => c.name.toLowerCase() === key) || null;
}

function isVisible(list, value) {
  const hit = findCategory(list, value);
  return Boolean(hit && hit.visible);
}

module.exports = { defaults, normalise, applyChanges, findCategory, isVisible, cleanNewName, MAX_CATEGORIES };
