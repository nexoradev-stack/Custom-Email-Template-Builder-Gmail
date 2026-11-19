'use strict';
const test = require('node:test');
const assert = require('node:assert');
const cats = require('../src/categories');
const teamsLib = require('../src/teams');
const { accessFor } = require('../src/sharing');

const D = 'example.com';
const at = { toDate: () => new Date() };

function setup() {
  let teams = [];
  let r = teamsLib.applyChanges(teams, { create: 'HR' }, D); teams = r.list; const hr = r.created.id;
  r = teamsLib.applyChanges(teams, { create: 'Delivery' }, D); teams = r.list; const del = r.created.id;
  teams = teamsLib.applyChanges(teams, { addMembers: { id: hr, emails: 'robin@example.com, sky@example.com' } }, D).list;
  teams = teamsLib.applyChanges(teams, { addMembers: { id: del, emails: ['dev@example.com'] } }, D).list;
  let list = cats.normalise([{ name: 'HR', visible: true }, { name: 'Delivery', visible: true }, { name: 'Events', visible: true }]);
  list = cats.applyChanges(list, { audience: { name: 'HR', everyone: false, teams: [hr], people: ['Jordan.Lee@example.com'] } });
  list = cats.applyChanges(list, { audience: { name: 'Delivery', everyone: false, teams: [del], people: [] } });
  return { teams, list, hr, del };
}

test('each person sees only the categories given to them', () => {
  const { teams, list } = setup();
  const sees = (email) => list.filter((c) => cats.canSee(list, c.name, email, teams)).map((c) => c.name);
  assert.deepStrictEqual(sees('jordan.lee@example.com'), ['HR', 'Events']);
  assert.deepStrictEqual(sees('robin@example.com'), ['HR', 'Events']);
  assert.deepStrictEqual(sees('dev@example.com'), ['Delivery', 'Events']);
  assert.deepStrictEqual(sees('nobody@example.com'), ['Events']);
});

test('new categories start as admins only', () => {
  const { teams } = setup();
  const list = cats.applyChanges(cats.normalise([{ name: 'HR', visible: true }]), { add: 'Leaders' });
  const leaders = cats.findCategory(list, 'Leaders');
  assert.strictEqual(leaders.visible, false);
  assert.strictEqual(cats.hasAudience(leaders), false);
  assert.strictEqual(cats.canSee(list, 'Leaders', 'robin@example.com', teams), false);
});

test('only company addresses can be added', () => {
  const { teams, hr } = setup();
  assert.throws(() => teamsLib.applyChanges(teams, { addMembers: { id: hr, emails: 'sky@gmail.com' } }, D), /Only example.com/);
  assert.throws(() => cats.applyChanges(cats.normalise([{ name: 'HR' }]), { audience: { name: 'HR', people: ['x@gmail.com'] } }), /Only/);
});

test('rename keeps who can see it; a removed member loses access', () => {
  let { teams, list, hr } = setup();
  list = cats.applyChanges(list, { rename: { from: 'HR', to: 'People' } });
  assert.strictEqual(cats.canSee(list, 'People', 'robin@example.com', teams), true);
  teams = teamsLib.applyChanges(teams, { removeMember: { id: hr, email: 'robin@example.com' } }, D).list;
  assert.strictEqual(cats.canSee(list, 'People', 'robin@example.com', teams), false);
  assert.strictEqual(cats.canSee(list, 'People', 'jordan.lee@example.com', teams), true, 'added by email, not through the team');
});

test('team names must be unique', () => {
  const { teams } = setup();
  assert.throws(() => teamsLib.applyChanges(teams, { create: 'hr' }, D), /already exists/);
});

test('hidden templates are for admins only, published or shared', () => {
  const pub = { status: 'published', publishedHtml: '<p>x</p>', hidden: true };
  const shared = { status: 'draft', sharedWith: ['alex@example.com'], sharedAt: at, sharedHtml: '<p>s</p>', hidden: true };
  assert.strictEqual(accessFor(pub, { email: 'a@example.com' }), null);
  assert.strictEqual(accessFor(shared, { email: 'alex@example.com' }), null);
  assert.strictEqual(accessFor(pub, { email: 'a@example.com' }, { admin: true }), 'published');
  assert.strictEqual(accessFor({ ...shared, hidden: false }, { email: 'alex@example.com' }), 'shared', 'switching it off brings sharing back');
});
