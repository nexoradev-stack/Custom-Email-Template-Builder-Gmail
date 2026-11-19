'use strict';

/**
 * Categories: which ones exist, and which ones users can see.
 * Each category is seen by everyone (visible), or only by chosen teams and people.
 * visible false with no teams and no people means only admins see it.
 */

const cfg = require('./config');
const { httpError } = require('./auth');

const { cleanShareList } = require('./sharing');

const MAX_CATEGORIES = 20;
const MAX_PEOPLE = 100;

function defaults() {
  const visible = cfg.defaultVisibleCategories.map((c) => c.toLowerCase());
  return cfg.categories.map((name) => ({ name, visible: visible.includes(name.toLowerCase()), teams: [], people: [] }));
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
    out.push({ name, visible: Boolean(item.visible), teams: cleanIds(item.teams), people: cleanPeople(item.people) });
  }
  return out.length ? out : defaults();
}

function cleanIds(v) {
  return Array.isArray(v) ? [...new Set(v.map((x) => String(x || '').trim()).filter((x) => /^[a-z0-9]{6,32}$/.test(x)))] : [];
}

function cleanPeople(v) {
  return Array.isArray(v) ? [...new Set(v.map((x) => String(x || '').trim().toLowerCase()).filter((x) => x.includes('@')))] : [];
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
  let list = current.map((c) => ({ ...c }));

  if (Array.isArray(body.visible)) {
    const on = new Set(body.visible.map((v) => String(v).trim().toLowerCase()));
    list = list.map((c) => ({ ...c, visible: on.has(c.name.toLowerCase()) }));
  }

  /* One category switched on or off: never touches the others. */
  if (body.set && typeof body.set === 'object') {
    const hit = findCategory(list, body.set.name);
    if (!hit) throw httpError(404, 'That category no longer exists. Click Refresh.');
    list = list.map((c) => (c.name === hit.name ? { ...c, visible: Boolean(body.set.visible) } : c));
  }

  /* Who can see one category: everyone, or only these teams and people (none = admins only). */
  if (body.audience && typeof body.audience === 'object') {
    const a = body.audience;
    const hit = findCategory(list, a.name);
    if (!hit) throw httpError(404, 'That category no longer exists. Click Refresh.');
    const teams = cleanIds(a.teams).filter((id) => !a.knownTeams || a.knownTeams.includes(id));
    const people = cleanShareList(a.people, cfg.domain, MAX_PEOPLE);
    list = list.map((c) => (c.name === hit.name ? { ...c, visible: Boolean(a.everyone), teams, people } : c));
  }

  if (body.rename && typeof body.rename === 'object') {
    const hit = findCategory(list, body.rename.from);
    if (!hit) throw httpError(404, 'That category no longer exists. Click Refresh.');
    const to = cleanNewName(body.rename.to);
    if (to.toLowerCase() !== hit.name.toLowerCase() && findCategory(list, to)) throw httpError(409, `A category called "${to}" already exists.`);
    list = list.map((c) => (c.name === hit.name ? { ...c, name: to } : c));
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
    /* New categories start as Admins only until someone chooses who can see them. */
    list.push({ name, visible: false, teams: [], people: [] });
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

/** Can this person (not an admin) see this category? Everyone, named by email, or in one of its teams. */
function canSee(list, value, email, teams) {
  const hit = findCategory(list, value);
  if (!hit) return false;
  if (hit.visible) return true;
  const me = String(email || '').toLowerCase();
  if (!me) return false;
  if ((hit.people || []).includes(me)) return true;
  const byId = new Map((teams || []).map((t) => [t.id, t]));
  return (hit.teams || []).some((id) => byId.has(id) && byId.get(id).members.includes(me));
}

/** Has anyone besides admins been given this category? (used by View as user) */
function hasAudience(c) {
  return Boolean(c && (c.visible || (c.teams || []).length || (c.people || []).length));
}

module.exports = { defaults, normalise, applyChanges, findCategory, isVisible, canSee, hasAudience, cleanNewName, MAX_CATEGORIES, MAX_PEOPLE };
