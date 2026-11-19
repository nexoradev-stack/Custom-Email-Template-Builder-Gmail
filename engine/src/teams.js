'use strict';

/**
 * Teams: named lists of people, kept inside the tool.
 * A category can be given to teams and to single people (see categories.js).
 */

const crypto = require('crypto');
const cfg = require('./config');
const { httpError } = require('./auth');
const { cleanShareList } = require('./sharing');

const MAX_TEAMS = 30;
const MAX_MEMBERS = 200;

function newId() {
  return crypto.randomBytes(6).toString('hex');
}

/** Cleans what is stored in the database. */
function normalise(stored) {
  const list = Array.isArray(stored) ? stored : [];
  const seen = new Set();
  const out = [];
  for (const t of list) {
    const id = String((t && t.id) || '');
    const name = String((t && t.name) || '').replace(/\s+/g, ' ').trim();
    if (!/^[a-z0-9]{6,32}$/.test(id) || !name || seen.has(id)) continue;
    seen.add(id);
    const members = Array.isArray(t.members) ? [...new Set(t.members.map((m) => String(m || '').trim().toLowerCase()).filter((m) => m.includes('@')))] : [];
    out.push({ id, name, members });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function cleanTeamName(v) {
  const name = String(v || '').replace(/\s+/g, ' ').trim();
  if (!name) throw httpError(400, 'Enter a team name.');
  if (name.length > 30) throw httpError(400, 'Team name must be 30 characters or fewer.');
  if (!/^[A-Za-z0-9][A-Za-z0-9 &/+'-]*$/.test(name)) throw httpError(400, 'Use only letters, numbers, spaces and & / + - \' in a team name.');
  return name;
}

function find(list, id) {
  const hit = list.find((t) => t.id === String(id || ''));
  if (!hit) throw httpError(404, 'That team no longer exists. Click Refresh.');
  return hit;
}

function nameTaken(list, name, exceptId) {
  return list.some((t) => t.id !== exceptId && t.name.toLowerCase() === name.toLowerCase());
}

/**
 * One change at a time:
 *   { create: 'HR' }                        returns the new team's id as created
 *   { rename: { id, name } }
 *   { remove: { id } }
 *   { addMembers: { id, emails: [...] } }
 *   { removeMember: { id, email } }
 */
function applyChanges(current, body, domain = cfg.domain) {
  const b = body || {};
  let list = current.map((t) => ({ ...t, members: [...t.members] }));
  let created = null;

  if (b.create !== undefined) {
    const name = cleanTeamName(b.create);
    if (nameTaken(list, name)) throw httpError(409, `A team called "${name}" already exists.`);
    if (list.length >= MAX_TEAMS) throw httpError(400, `You can have up to ${MAX_TEAMS} teams.`);
    created = { id: newId(), name, members: [] };
    list.push(created);
  } else if (b.rename) {
    const hit = find(list, b.rename.id);
    const name = cleanTeamName(b.rename.name);
    if (nameTaken(list, name, hit.id)) throw httpError(409, `A team called "${name}" already exists.`);
    hit.name = name;
  } else if (b.remove) {
    const hit = find(list, b.remove.id);
    list = list.filter((t) => t.id !== hit.id);
  } else if (b.addMembers) {
    const hit = find(list, b.addMembers.id);
    const raw = Array.isArray(b.addMembers.emails) ? b.addMembers.emails : String(b.addMembers.emails || '').split(/[\s,;]+/);
    const emails = cleanShareList(raw, domain, MAX_MEMBERS);
    if (!emails.length) throw httpError(400, 'Type an email address to add.');
    emails.forEach((e) => { if (!hit.members.includes(e)) hit.members.push(e); });
    if (hit.members.length > MAX_MEMBERS) throw httpError(400, `A team can have up to ${MAX_MEMBERS} people.`);
  } else if (b.removeMember) {
    const hit = find(list, b.removeMember.id);
    const email = String(b.removeMember.email || '').trim().toLowerCase();
    hit.members = hit.members.filter((m) => m !== email);
  } else {
    throw httpError(400, 'Nothing to change.');
  }
  return { list: normalise(list), created };
}

/** Teams this person is in. */
function teamsOf(list, email) {
  const me = String(email || '').toLowerCase();
  return list.filter((t) => t.members.includes(me));
}

module.exports = { normalise, applyChanges, teamsOf, cleanTeamName, MAX_TEAMS, MAX_MEMBERS };
