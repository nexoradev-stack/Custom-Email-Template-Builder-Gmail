'use strict';
const test = require('node:test');
const assert = require('node:assert');
const cats = require('../src/categories');
const teamsLib = require('../src/teams');
const { accessFor } = require('../src/sharing');

const D = require('../src/config').domain;
const at_ = (name) => `${name}@${D}`;
const at = { toDate: () => new Date() };

function setup() {
  let teams = [];
  let r = teamsLib.applyChanges(teams, { create: 'HR' }, D); teams = r.list; const hr = r.created.id;
  r = teamsLib.applyChanges(teams, { create: 'Delivery' }, D); teams = r.list; const del = r.created.id;
  teams = teamsLib.applyChanges(teams, { addMembers: { id: hr, emails: `${at_('robin')}, ${at_('sky')}` } }, D).list;
  teams = teamsLib.applyChanges(teams, { addMembers: { id: del, emails: [at_('dev')] } }, D).list;
  let list = cats.normalise([{ name: 'HR', visible: true }, { name: 'Delivery', visible: true }, { name: 'Events', visible: true }]);
  list = cats.applyChanges(list, { audience: { name: 'HR', everyone: false, teams: [hr], people: [at_('Jordan.Lee')] } });
  list = cats.applyChanges(list, { audience: { name: 'Delivery', everyone: false, teams: [del], people: [] } });
  return { teams, list, hr, del };
}

test('each person sees only the categories given to them', () => {
  const { teams, list } = setup();
  const sees = (email) => list.filter((c) => cats.canSee(list, c.name, email, teams)).map((c) => c.name);
  assert.deepStrictEqual(sees(at_('jordan.lee')), ['HR', 'Events']);
  assert.deepStrictEqual(sees(at_('robin')), ['HR', 'Events']);
  assert.deepStrictEqual(sees(at_('dev')), ['Delivery', 'Events']);
  assert.deepStrictEqual(sees(at_('nobody')), ['Events']);
});

test('new categories start as admins only', () => {
  const { teams } = setup();
  const list = cats.applyChanges(cats.normalise([{ name: 'HR', visible: true }]), { add: 'Leaders' });
  const leaders = cats.findCategory(list, 'Leaders');
  assert.strictEqual(leaders.visible, false);
  assert.strictEqual(cats.hasAudience(leaders), false);
  assert.strictEqual(cats.canSee(list, 'Leaders', at_('robin'), teams), false);
});

test('only company addresses can be added', () => {
  const { teams, hr } = setup();
  assert.throws(() => teamsLib.applyChanges(teams, { addMembers: { id: hr, emails: 'sky@gmail.com' } }, D), /Only /);
  assert.throws(() => cats.applyChanges(cats.normalise([{ name: 'HR' }]), { audience: { name: 'HR', people: ['x@gmail.com'] } }), /Only/);
});

test('rename keeps who can see it; a removed member loses access', () => {
  let { teams, list, hr } = setup();
  list = cats.applyChanges(list, { rename: { from: 'HR', to: 'People' } });
  assert.strictEqual(cats.canSee(list, 'People', at_('robin'), teams), true);
  teams = teamsLib.applyChanges(teams, { removeMember: { id: hr, email: at_('robin') } }, D).list;
  assert.strictEqual(cats.canSee(list, 'People', at_('robin'), teams), false);
  assert.strictEqual(cats.canSee(list, 'People', at_('jordan.lee'), teams), true, 'added by email, not through the team');
});

test('team names must be unique', () => {
  const { teams } = setup();
  assert.throws(() => teamsLib.applyChanges(teams, { create: 'hr' }, D), /already exists/);
});

test('hidden templates are for admins only, published or shared', () => {
  const pub = { status: 'published', publishedHtml: '<p>x</p>', hidden: true };
  const shared = { status: 'draft', sharedWith: [at_('alex')], sharedAt: at, sharedHtml: '<p>s</p>', hidden: true };
  assert.strictEqual(accessFor(pub, { email: at_('a') }), null);
  assert.strictEqual(accessFor(shared, { email: at_('alex') }), null);
  assert.strictEqual(accessFor(pub, { email: at_('a') }, { admin: true }), 'published');
  assert.strictEqual(accessFor({ ...shared, hidden: false }, { email: at_('alex') }), 'shared', 'switching it off brings sharing back');
});
