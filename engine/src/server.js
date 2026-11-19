'use strict';

const crypto = require('crypto');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { Firestore, FieldValue } = require('@google-cloud/firestore');
const { Storage } = require('@google-cloud/storage');

const cfg = require('./config');
const { authenticate, requireAdmin, httpError, sha } = require('./auth');
const { processTemplate } = require('./pipeline');
const { uploadPage, expiredPage, unavailablePage } = require('./uploadPage');
const { previewPage } = require('./previewPage');
const { editorPage } = require('./editorPage');
const { customisePage } = require('./customisePage');
const { markBlocks, cleanForEmail, cleanLocks, allLocks } = require('./blocks');
/* sharp (image tools) loads on first use, so the engine starts faster after a quiet period. */
let sharpLib = null;
const sharp = (...args) => {
  if (!sharpLib) sharpLib = require('sharp');
  return sharpLib(...args);
};
const { fetchImage } = require('./imageImport');
const { FONTS, backupName } = require('./fonts');
const { renderThumbnail } = require('./thumbs');
const cats = require('./categories');
const teamsLib = require('./teams');
const { tooBigError } = require('./imageLimit');
const { sharedList, accessFor, usableHtml, cleanShareList } = require('./sharing');
const { reducerPage, CSP: REDUCER_CSP } = require('./reducerPage');

const db = new Firestore({ databaseId: cfg.databaseId });
const bucket = new Storage().bucket(cfg.bucket);
const templates = db.collection('templates');
const images = db.collection('images');
const tickets = db.collection('tickets');
const categoriesDoc = db.collection('settings').doc('categories');
const teamsDoc = db.collection('settings').doc('teams');
const customs = db.collection('custom');
const CUSTOM_HOURS = 24;

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  next();
});

/* Brand images used by the sidebar (header, footer, icon, placeholder). */
app.use('/assets', express.static(path.join(__dirname, '..', 'assets'), { maxAge: '1h', fallthrough: false }));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const iso = (t) => (t && typeof t.toDate === 'function' ? t.toDate().toISOString() : null);
const baseUrl = (req) => `https://${req.get('host')}`;

function summary(doc, admin, req) {
  const d = doc.data();
  const out = {
    id: doc.id,
    name: d.name,
    category: d.category,
    updatedAt: iso(admin ? d.updatedAt : d.publishedAt || d.updatedAt),
    thumbUrl: d.thumbUrl || (admin && d.sharedThumbUrl) || `${baseUrl(req)}/assets/thumb-placeholder.png`
  };
  if (admin) {
    out.status = d.status;
    out.version = d.version || 0;
    out.hasUnpublishedChanges = Boolean(d.hasUnpublishedChanges);
    out.updatedBy = d.updatedBy || null;
    out.sharedWith = sharedList(d);
    out.sharedStale = Boolean(d.sharedStale) && out.sharedWith.length > 0;
    out.hidden = Boolean(d.hidden);
  }
  return out;
}

/* ---------- sharing a template with named people (not everyone) ---------- */

/** Shares the saved template with exactly these people (an empty list stops sharing). */
async function shareFor(email, id, people) {
  const list = cleanShareList(people);
  const doc = await getTemplate(id);
  const d = doc.data();
  if (d.status === 'published') throw httpError(409, 'This template is already published for everyone, so everyone can use it.');
  if (!list.length) {
    await doc.ref.update({ sharedWith: [], sharedStale: false, sharedHtml: FieldValue.delete(), sharedLocks: FieldValue.delete(), sharedAt: FieldValue.delete(), sharedBy: FieldValue.delete() });
    return { id: doc.id, sharedWith: [] };
  }
  const result = processTemplate(d.sourceHtml);
  if (result.hasErrors) {
    await doc.ref.update({ checks: result.checks, draftHtml: result.html });
    throw httpError(422, 'Fix the problems marked in the Gmail check, then share again.', { checks: result.checks });
  }
  await doc.ref.update({
    sharedWith: list,
    sharedHtml: result.html,
    draftHtml: result.html,
    checks: result.checks,
    sharedLocks: d.locks || [],
    sharedStale: false,
    sharedBy: email,
    sharedAt: FieldValue.serverTimestamp()
  });
  console.log(`Template "${d.name}" (${doc.id}) shared by ${email} with ${list.length} people`);
  sharedThumbLater(doc.id, result.html);
  return { id: doc.id, sharedWith: list, checks: result.checks };
}

function cleanName(v) {
  const name = String(v || '').replace(/\s+/g, ' ').trim();
  if (!name) throw httpError(400, 'Enter a template name.');
  if (name.length > 80) throw httpError(400, 'Template name must be 80 characters or fewer.');
  return name;
}

/* ---------- categories (which exist, and which users can see) ---------- */

async function loadCategories() {
  const doc = await categoriesDoc.get();
  return cats.normalise(doc.exists ? doc.data().list : null);
}

function cleanCategory(v, list) {
  const hit = cats.findCategory(list, v);
  if (!hit) throw httpError(400, `Choose a category: ${list.map((c) => c.name).join(', ')}.`);
  return hit.name;
}

async function loadTeams() {
  const doc = await teamsDoc.get();
  return teamsLib.normalise(doc.exists ? doc.data().list : null);
}

/** Categories and teams together: everything needed to decide who sees what. */
async function loadAccess() {
  const [list, teams] = await Promise.all([loadCategories(), loadTeams()]);
  return { list, teams };
}

/**
 * Can this person see templates in this category?
 * Admins: always. View as user: any category given to someone. Users: everyone, their email, or their team.
 */
function seesCategory(user, access, category) {
  if (user.isAdmin) return true;
  if (user.viewingAsUser) return cats.hasAudience(cats.findCategory(access.list, category));
  return cats.canSee(access.list, category, user.email, access.teams);
}

/** What the sidebar needs: admins get every category, users only the ones they can see. */
function categoriesFor(user, access) {
  return access.list.filter((c) => seesCategory(user, access, c.name));
}

/** Who a category is seen by, in words (for admins). */
function audienceText(c, teams) {
  if (c.visible) return 'Everyone';
  const names = (c.teams || []).map((id) => teams.find((t) => t.id === id)).filter(Boolean).map((t) => t.name);
  const people = (c.people || []).length;
  const parts = [];
  if (names.length) parts.push(names.length === 1 ? `${names[0]} team` : `${names.length} teams`);
  if (people) parts.push(`${people} ${people === 1 ? 'person' : 'people'}`);
  return parts.length ? parts.join(' + ') : 'Admins only';
}

async function getTemplate(id) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(id))) throw httpError(404, 'Template not found.');
  const doc = await templates.doc(id).get();
  if (!doc.exists) throw httpError(404, 'Template not found.');
  return doc;
}

/* ---------- one-time links (upload window, preview window) ---------- */

async function createTicket(type, data, minutes) {
  const ticket = crypto.randomBytes(32).toString('hex');
  await tickets.doc(sha(ticket)).set({
    ...data,
    type,
    expiresAt: new Date(Date.now() + minutes * 60 * 1000),
    createdAt: FieldValue.serverTimestamp()
  });
  return ticket;
}

async function readTicket(value, type) {
  if (!/^[a-f0-9]{64}$/.test(String(value || ''))) return null;
  const doc = await tickets.doc(sha(value)).get();
  if (!doc.exists) return null;
  const d = doc.data();
  if ((d.type || 'upload') !== type) return null;
  const expires = d.expiresAt && d.expiresAt.toDate ? d.expiresAt.toDate() : new Date(0);
  return expires > new Date() ? d : null;
}

async function updateTicket(value, fields) {
  await tickets.doc(sha(value)).update(fields);
}

/* ---------- health ---------- */

app.get('/health', (req, res) => res.json({ ok: true }));

/* ---------- image reducer (runs in the browser; no sign-in needed) ---------- */

app.get('/reducer', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.set('Content-Security-Policy', REDUCER_CSP);
  res.type('html').send(reducerPage());
});

/* ---------- who am I ---------- */

app.get('/api/me', authenticate, (req, res) => {
  loadAccess()
    .then((access) => res.json({ email: req.user.email, isAdmin: req.user.isAdmin, categories: categoriesFor(req.user, access).map((c) => c.name) }))
    .catch((err) => { console.error(err); res.status(500).json({ error: 'Something went wrong. Try again.' }); });
});

/* ---------- templates: everyone ---------- */

app.get('/api/templates', authenticate, wrap(async (req, res) => {
  const admin = req.user.isAdmin;
  const fields = ['name', 'category', 'updatedAt', 'publishedAt', 'thumbUrl', 'thumbVersion', 'version', 'status', 'sharedWith', 'sharedBy', 'sharedAt', 'sharedThumbUrl', 'hidden'];
  const me = String(req.user.email || '').toLowerCase();
  const query = admin
    ? templates.select(...fields, 'hasUnpublishedChanges', 'updatedBy', 'sharedStale')
    : templates.where('status', '==', 'published').select(...fields);
  const sharedQuery = admin ? null : templates.where('sharedWith', 'array-contains', me).select(...fields);
  const [snap, sharedSnap, access, custom] = await Promise.all([query.get(), sharedQuery ? sharedQuery.get() : null, loadAccess(), loadCustom(req.user.email)]);
  const list = access.list;

  snap.docs.forEach((d) => {
    const x = d.data();
    if (x.status === 'published' && x.thumbVersion !== x.version) refreshThumb(d.id, x.version);
  });

  const q = String(req.query.q || '').trim().toLowerCase();
  const category = String(req.query.category || '').trim().toLowerCase();
  const matches = (t) => (!q || t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
  const items = snap.docs
    .filter((d) => admin || !d.data().hidden)
    .map((d) => summary(d, admin, req))
    .filter((t) => seesCategory(req.user, access, t.category))
    .filter(matches)
    .filter((t) => !category || ['shared', 'drafts', 'hidden'].includes(category) || t.category.toLowerCase() === category)
    .filter((t) => category !== 'hidden' || t.hidden)
    .filter((t) => category !== 'shared' || (t.sharedWith && t.sharedWith.length))
    .filter((t) => category !== 'drafts' || (t.status !== 'published' && !(t.sharedWith && t.sharedWith.length)))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  /* Templates shared with this person by name (users only; admins already see everything). */
  const sharedWithMe = (sharedSnap ? sharedSnap.docs : [])
    .filter((d) => accessFor(d.data(), req.user) === 'shared')
    .map((d) => ({
      ...summary(d, false, req),
      thumbUrl: d.data().sharedThumbUrl || `${baseUrl(req)}/assets/thumb-placeholder.png`,
      sharedBy: d.data().sharedBy || '',
      sharedAt: iso(d.data().sharedAt)
    }))
    .filter(matches);

  res.json({ custom: custom ? { templateId: custom.templateId, name: custom.name, changes: custom.changes || 0 } : null, templates: items, sharedWithMe, isAdmin: admin, realAdmin: Boolean(req.user.realAdmin), viewingAsUser: Boolean(req.user.viewingAsUser), categories: categoriesFor(req.user, access), hiddenCount: admin ? snap.docs.filter((d) => d.data().hidden).length : undefined });
}));

app.get('/api/templates/:id', authenticate, wrap(async (req, res) => {
  const doc = await getTemplate(req.params.id);
  const d = doc.data();
  const all = await loadAccess();
  const list = all.list;
  if (!req.user.isAdmin) {
    const access = accessFor(d, req.user);
    if (!access || (access === 'published' && !seesCategory(req.user, all, d.category))) throw httpError(404, 'Template not found.');
    return res.json({ id: doc.id, name: d.name, category: d.category, shared: access === 'shared', html: cleanForEmail(usableHtml(d, access)) });
  }
  res.json(adminTemplate(doc, req, list, req.query.lite === '1'));
}));

/**
 * What an admin sees about one template. lite = the template page in Gmail:
 * everything except the (large) code, so the panel loads faster.
 */
function adminTemplate(doc, req, list, lite) {
  const d = doc.data();
  const out = {
    ...summary(doc, true, req),
    categories: list,
    sharedBy: d.sharedBy || null,
    sharedAt: iso(d.sharedAt),
    checks: d.checks || []
  };
  if (!lite) {
    out.html = d.publishedHtml ? cleanForEmail(d.publishedHtml) : null;
    out.sourceHtml = d.sourceHtml || '';
    out.draftHtml = d.draftHtml || '';
  }
  return out;
}

/** The template page's data after an action, so Gmail needs no second call. */
async function freshTemplate(id, req) {
  const [doc, list] = await Promise.all([getTemplate(id), loadCategories()]);
  return adminTemplate(doc, req, list, true);
}

app.post('/api/preview-ticket', authenticate, wrap(async (req, res) => {
  const body = req.body || {};
  const doc = await getTemplate(body.id);
  const d = doc.data();
  const draft = Boolean(body.draft);
  if (draft && !req.user.isAdmin) throw httpError(403, 'Only template admins can preview drafts.');
  const access = draft ? null : accessFor(d, req.user, { admin: req.user.isAdmin });
  if (!draft && !access) throw httpError(404, 'Template not found.');
  if (!req.user.isAdmin && access === 'published' && !seesCategory(req.user, await loadAccess(), d.category)) throw httpError(404, 'Template not found.');
  if (draft && !d.draftHtml) throw httpError(400, 'Save the template first, then preview it.');
  const ticket = await createTicket('preview', { email: req.user.email, templateId: doc.id, draft, shared: access === 'shared', admin: Boolean(req.user.isAdmin) }, 30);
  res.json({ url: `${baseUrl(req)}/preview?ticket=${ticket}` });
}));

app.get('/preview', wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('Content-Security-Policy', "default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; frame-ancestors 'none'");
  const ticket = await readTicket(req.query.ticket, 'preview');
  if (!ticket) return res.status(410).type('html').send(expiredPage('preview'));
  const doc = await templates.doc(ticket.templateId).get();
  if (!doc.exists) return res.status(404).type('html').send(expiredPage('preview'));
  const d = doc.data();
  const access = ticket.draft ? null : accessFor(d, { email: ticket.email }, { admin: Boolean(ticket.admin) });
  const html = ticket.draft ? d.draftHtml : access ? usableHtml(d, access) : null;
  if (!html) return res.status(404).type('html').send(ticket.draft ? expiredPage('preview') : unavailablePage());
  res.type('html').send(previewPage({ name: d.name, category: d.category, html, draft: ticket.draft }));
}));

/* ---------- templates: admins ---------- */

app.post('/api/check', authenticate, requireAdmin, wrap(async (req, res) => {
  const result = processTemplate(req.body && req.body.sourceHtml);
  const marked = markBlocks(result.html);
  res.json({ html: marked.html, blocks: marked.blocks, checks: result.checks, hasErrors: result.hasErrors });
}));

/** Saves a template (new or existing) for an admin. Used by the sidebar and the editor window. */
async function saveTemplateFor(email, body) {
  const name = cleanName(body.name);
  const category = cleanCategory(body.category, await loadCategories());
  const sourceHtml = String(body.sourceHtml || '');
  if (!sourceHtml.trim()) throw httpError(400, 'Paste the HTML and CSS for this template.');
  if (Buffer.byteLength(sourceHtml) > cfg.maxSourceBytes) throw httpError(400, 'The pasted code is too large.');

  let id = body.id || null;
  const clash = await templates.where('nameLower', '==', name.toLowerCase()).select('createdBy', 'status').get();
  const others = clash.docs.filter((d) => d.id !== id);
  if (!id && others.length === 1 && others[0].data().status === 'draft' && others[0].data().createdBy === email) {
    /* Same admin saving their own new draft again (for example a second click): keep working on that draft. */
    id = others[0].id;
  } else if (others.length) {
    throw httpError(409, `A template called "${name}" already exists.`);
  }

  /* Two admins on one template: warn instead of silently replacing someone else's saved work. */
  if (id && !body.force && body.baseUpdatedAt) {
    const current = await getTemplate(id);
    const cd = current.data();
    const at = cd.updatedAt && cd.updatedAt.toMillis ? cd.updatedAt.toMillis() : 0;
    if (at > Number(body.baseUpdatedAt) + 1 && cd.updatedBy && cd.updatedBy !== email) {
      throw httpError(409, `${cd.updatedBy} saved this template after you opened it.`, { conflict: { by: cd.updatedBy, at: new Date(at).toISOString() } });
    }
  }

  const result = processTemplate(sourceHtml);
  const lockFields = body.locks === undefined ? {} : { locks: cleanLocks(body.locks, markBlocks(result.html).blocks) };
  if (body.mode === 'blocks' || body.mode === 'html') lockFields.mode = body.mode;
  if (Array.isArray(body.blocks)) {
    const json = JSON.stringify(body.blocks);
    if (Buffer.byteLength(json) > 300 * 1024) throw httpError(400, 'This template has too many blocks. Remove some and try again.');
    lockFields.blocks = json;
  }
  const fields = {
    ...lockFields,
    name,
    nameLower: name.toLowerCase(),
    category,
    sourceHtml,
    draftHtml: result.html,
    checks: result.checks,
    updatedBy: email,
    updatedAt: FieldValue.serverTimestamp()
  };

  let status = 'draft';
  let hasUnpublishedChanges = false;
  if (id) {
    const existing = await getTemplate(id);
    const ed = existing.data();
    status = ed.status || 'draft';
    hasUnpublishedChanges = status === 'published';
    /* Shared with named people: they keep the copy they were given until it is shared again. */
    const shared = sharedList(ed).length > 0;
    const newLocks = lockFields.locks || ed.locks || [];
    const sharedStale = shared && (result.html !== ed.sharedHtml || JSON.stringify(newLocks) !== JSON.stringify(ed.sharedLocks || []));
    await existing.ref.update({ ...fields, hasUnpublishedChanges, sharedStale });
  } else {
    const ref = await templates.add({
      ...fields,
      status: 'draft',
      version: 0,
      hasUnpublishedChanges: false,
      createdBy: email,
      createdAt: FieldValue.serverTimestamp()
    });
    id = ref.id;
  }
  const after = (await templates.doc(id).get()).data() || {};
  return {
    id, status, hasUnpublishedChanges, checks: result.checks, hasErrors: result.hasErrors, html: result.html, locks: lockFields.locks,
    sharedWith: sharedList(after), sharedStale: Boolean(after.sharedStale),
    updatedAtMs: after.updatedAt && after.updatedAt.toMillis ? after.updatedAt.toMillis() : Date.now()
  };
}

app.post('/api/templates', authenticate, requireAdmin, wrap(async (req, res) => {
  res.json(await saveTemplateFor(req.user.email, req.body || {}));
}));

async function updatedAtMs(id) {
  const d = (await templates.doc(id).get()).data() || {};
  return d.updatedAt && d.updatedAt.toMillis ? d.updatedAt.toMillis() : Date.now();
}

/* Thumbnails are made in the background, so publishing never waits for them. */
const thumbsInProgress = new Set();
function thumbnailLater(id, version, html) {
  const key = `${id}:${version}`;
  if (thumbsInProgress.has(key)) return;
  thumbsInProgress.add(key);
  makeThumbnail(id, version, html).finally(() => thumbsInProgress.delete(key));
}

/** Makes a missing or old thumbnail in the background (for example right after publishing). */
function refreshThumb(id, version) {
  if (thumbsInProgress.has(`${id}:${version}`)) return;
  templates.doc(id).get()
    .then((doc) => { if (doc.exists && doc.data().publishedHtml) thumbnailLater(id, version, doc.data().publishedHtml); })
    .catch((err) => console.warn('Thumbnail check failed for', id, err.message));
}

/** Thumbnail of the copy shared with named people (made in the background, like the published one). */
function sharedThumbLater(id, html) {
  const key = `${id}:shared:${crypto.createHash('sha256').update(html).digest('hex').slice(0, 12)}`;
  if (thumbsInProgress.has(key)) return;
  thumbsInProgress.add(key);
  renderThumbnail(html)
    .then(async (png) => {
      const objectName = `thumbs/${id}-shared-${crypto.randomBytes(3).toString('hex')}.jpg`;
      await bucket.file(objectName).save(png, {
        resumable: false,
        contentType: 'image/jpeg',
        metadata: { cacheControl: 'public, max-age=31536000, immutable' },
        preconditionOpts: { ifGenerationMatch: 0 }
      });
      await templates.doc(id).update({ sharedThumbUrl: `${cfg.libraryPrefix}${objectName}` });
    })
    .catch((err) => console.warn('Shared thumbnail failed for', id, err.message))
    .finally(() => thumbsInProgress.delete(key));
}

async function makeThumbnail(id, version, html) {
  try {
    const png = await renderThumbnail(html);
    const objectName = `thumbs/${id}-v${version}-${crypto.randomBytes(3).toString('hex')}.jpg`;
    await bucket.file(objectName).save(png, {
      resumable: false,
      contentType: 'image/jpeg',
      metadata: { cacheControl: 'public, max-age=31536000, immutable' },
      preconditionOpts: { ifGenerationMatch: 0 }
    });
    const thumbUrl = `${cfg.libraryPrefix}${objectName}`;
    await templates.doc(id).update({ thumbUrl, thumbVersion: version });
    return thumbUrl;
  } catch (err) {
    console.warn('Thumbnail failed for', id, err.message);
    return null;
  }
}

/** Publishes the saved code of a template for everyone. */
async function publishFor(email, id, options) {
  const opts = options || {};
  const doc = await getTemplate(id);
  const result = processTemplate(doc.data().sourceHtml);
  if (result.hasErrors) {
    await doc.ref.update({ checks: result.checks, draftHtml: result.html });
    throw httpError(422, 'Fix the problems marked in the Gmail check, then publish again.', { checks: result.checks });
  }

  const version = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(doc.ref);
    const next = (fresh.data().version || 0) + 1;
    tx.update(doc.ref, {
      status: 'published',
      version: next,
      publishedHtml: result.html,
      draftHtml: result.html,
      checks: result.checks,
      hasUnpublishedChanges: false,
      /* Published for everyone: the named-people list is no longer needed. */
      sharedWith: [],
      sharedStale: false,
      publishedBy: email,
      publishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: email
    });
    tx.set(doc.ref.collection('versions').doc(String(next)), {
      version: next,
      name: fresh.data().name,
      sourceHtml: fresh.data().sourceHtml,
      html: result.html,
      mode: fresh.data().mode || 'html',
      blocks: fresh.data().blocks || null,
      locks: fresh.data().locks || [],
      restoredFrom: opts.restoredFrom || null,
      publishedBy: email,
      publishedAt: FieldValue.serverTimestamp()
    });
    return next;
  });

  thumbnailLater(doc.id, version, result.html);
  return { id: doc.id, status: 'published', version, checks: result.checks, html: result.html, updatedAtMs: await updatedAtMs(doc.id) };
}

app.post('/api/templates/:id/publish', authenticate, requireAdmin, wrap(async (req, res) => {
  const out = await publishFor(req.user.email, req.params.id);
  res.json({ ...out, template: await freshTemplate(req.params.id, req) });
}));

/* body: { people: ['name@your-company.com', ...] } — exactly who it is shared with; [] stops sharing */
app.post('/api/templates/:id/share', authenticate, requireAdmin, wrap(async (req, res) => {
  const out = await shareFor(req.user.email, req.params.id, (req.body || {}).people);
  res.json({ ...out, template: await freshTemplate(req.params.id, req) });
}));

app.post('/api/templates/:id/unpublish', authenticate, requireAdmin, wrap(async (req, res) => {
  const doc = await getTemplate(req.params.id);
  await doc.ref.update({
    status: 'unpublished',
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: req.user.email
  });
  res.json({ id: doc.id, status: 'unpublished', template: await freshTemplate(doc.id, req) });
}));

app.post('/api/templates/:id/delete', authenticate, requireAdmin, wrap(async (req, res) => {
  const doc = await getTemplate(req.params.id);
  const name = doc.data().name;
  await db.recursiveDelete(doc.ref);
  console.log(`Template "${name}" (${doc.id}) deleted by ${req.user.email}`);
  res.json({ id: doc.id, deleted: true, name });
}));

/* ---------- make a copy, versions and restore: admins ---------- */

async function freeName(base) {
  for (let n = 1; n < 50; n++) {
    const name = cleanName(n === 1 ? `${base} (copy)` : `${base} (copy ${n})`);
    const clash = await templates.where('nameLower', '==', name.toLowerCase()).select().limit(1).get();
    if (clash.empty) return name;
  }
  throw httpError(409, 'Too many copies with this name. Rename some first.');
}

app.post('/api/templates/:id/copy', authenticate, requireAdmin, wrap(async (req, res) => {
  const doc = await getTemplate(req.params.id);
  const d = doc.data();
  const base = String(d.name || 'Template').replace(/\s*\(copy(?: \d+)?\)$/i, '').slice(0, 70);
  const name = await freeName(base);
  const ref = await templates.add({
    name,
    nameLower: name.toLowerCase(),
    category: d.category,
    sourceHtml: d.sourceHtml || '',
    draftHtml: d.draftHtml || '',
    checks: d.checks || [],
    locks: d.locks || [],
    mode: d.mode || 'html',
    ...(d.blocks ? { blocks: d.blocks } : {}),
    status: 'draft',
    version: 0,
    hasUnpublishedChanges: false,
    copiedFrom: doc.id,
    createdBy: req.user.email,
    createdAt: FieldValue.serverTimestamp(),
    updatedBy: req.user.email,
    updatedAt: FieldValue.serverTimestamp()
  });
  res.json({ id: ref.id, name, template: await freshTemplate(ref.id, req) });
}));

app.get('/api/templates/:id/versions', authenticate, requireAdmin, wrap(async (req, res) => {
  const doc = await getTemplate(req.params.id);
  const snap = await doc.ref.collection('versions').orderBy('version', 'desc').limit(30).get();
  res.json({
    current: doc.data().version || 0,
    versions: snap.docs.map((v) => ({
      version: v.data().version,
      publishedBy: v.data().publishedBy || '',
      publishedAt: iso(v.data().publishedAt),
      restoredFrom: v.data().restoredFrom || null
    }))
  });
}));

/* body: { version } — puts that version back and publishes it as a new version */
app.post('/api/templates/:id/restore', authenticate, requireAdmin, wrap(async (req, res) => {
  const doc = await getTemplate(req.params.id);
  const n = Math.round(Number(req.body && req.body.version));
  const v = await doc.ref.collection('versions').doc(String(n)).get();
  if (!v.exists) throw httpError(404, 'That version could not be found.');
  const vd = v.data();
  await doc.ref.update({
    sourceHtml: vd.sourceHtml,
    mode: vd.blocks ? 'blocks' : (vd.mode === 'blocks' ? 'html' : (vd.mode || 'html')),
    blocks: vd.blocks || FieldValue.delete(),
    locks: vd.locks || doc.data().locks || [],
    updatedBy: req.user.email,
    updatedAt: FieldValue.serverTimestamp()
  });
  const out = await publishFor(req.user.email, doc.id, { restoredFrom: n });
  res.json({ ...out, restoredFrom: n, template: await freshTemplate(doc.id, req) });
}));

/* ---------- full-size editor window: admins ---------- */

/* body: { id } for an existing template, or nothing for a new one */
app.post('/api/editor-ticket', authenticate, requireAdmin, wrap(async (req, res) => {
  const id = (req.body && req.body.id) || null;
  if (id) await getTemplate(id);
  const ticket = await createTicket('editor', { email: req.user.email, templateId: id }, 120);
  res.json({ url: `${baseUrl(req)}/editor?ticket=${ticket}` });
}));

const EDITOR_CSP = "default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'";

app.get('/editor', wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('Content-Security-Policy', EDITOR_CSP);
  const ticket = await readTicket(req.query.ticket, 'editor');
  if (!ticket) return res.status(410).type('html').send(expiredPage('editor'));
  const list = await loadCategories();
  let template = null;
  if (ticket.templateId) {
    const doc = await templates.doc(ticket.templateId).get();
    if (!doc.exists) return res.status(404).type('html').send(expiredPage('editor'));
    const d = doc.data();
    template = {
      name: d.name,
      category: d.category,
      sourceHtml: d.sourceHtml || '',
      status: d.status,
      hasUnpublishedChanges: Boolean(d.hasUnpublishedChanges),
      checks: d.checks || [],
      locks: d.locks || [],
      mode: d.mode || (d.blocks ? 'blocks' : 'html'),
      blocks: d.blocks ? safeParse(d.blocks) : null,
      sharedWith: sharedList(d),
      sharedStale: Boolean(d.sharedStale),
      updatedAtMs: d.updatedAt && d.updatedAt.toMillis ? d.updatedAt.toMillis() : 0
    };
  }
  res.type('html').send(editorPage({ ticket: req.query.ticket, template, categories: list, fonts: FONTS.map((f) => ({ name: f.name, stack: f.stack, web: Boolean(f.web), backup: backupName(f) })), libraryPrefix: cfg.libraryPrefix, domain: cfg.domain }));
}));

function safeParse(json) {
  try { return JSON.parse(json); } catch (e) { return null; }
}

async function editorTicket(req) {
  const ticket = await readTicket(req.query.ticket, 'editor');
  if (!ticket) throw httpError(410, 'This editor tab has expired. Copy your code somewhere safe, then click Edit code in Gmail again.');
  return ticket;
}

app.post('/editor/check', wrap(async (req, res) => {
  await editorTicket(req);
  const result = processTemplate(req.body && req.body.sourceHtml);
  const marked = markBlocks(result.html);
  res.json({ html: marked.html, blocks: marked.blocks, checks: result.checks, hasErrors: result.hasErrors });
}));

async function editorSave(req) {
  const ticket = await editorTicket(req);
  const body = req.body || {};
  const saved = await saveTemplateFor(ticket.email, { ...body, id: ticket.templateId || null });
  if (saved.id !== ticket.templateId) await updateTicket(req.query.ticket, { templateId: saved.id });
  return { ticket, saved };
}

app.post('/editor/save', wrap(async (req, res) => {
  const { saved } = await editorSave(req);
  res.json(saved);
}));

app.post('/editor/publish', wrap(async (req, res) => {
  const { ticket, saved } = await editorSave(req);
  if (saved.hasErrors) {
    throw httpError(422, 'Saved, but fix the problems marked in the Gmail check before publishing.', { checks: saved.checks });
  }
  res.json(await publishFor(ticket.email, saved.id));
}));

/* body: the editor's template + people: [...] — saves, then shares with exactly those people */
app.post('/editor/share', wrap(async (req, res) => {
  const { ticket, saved } = await editorSave(req);
  if (saved.hasErrors && (req.body.people || []).length) {
    throw httpError(422, 'Saved, but fix the problems marked in the Gmail check before sharing.', { checks: saved.checks });
  }
  const out = await shareFor(ticket.email, saved.id, req.body.people);
  res.json({ ...saved, ...out, sharedStale: false, updatedAtMs: await updatedAtMs(saved.id) });
}));

/* ---------- block builder: images (admins, from the editor tab) ---------- */

/** Cuts an image to exactly w x h (shown size), at twice that for sharp screens, never wider than 1200 px. */
async function cutToBox(buffer, w, h) {
  const scale = Math.min(2, 1200 / w);
  return sharp(buffer, { limitInputPixels: 80e6 }).rotate()
    .resize(Math.round(w * scale), Math.round(h * scale), { fit: 'cover', position: 'attention' })
    .flatten({ background: '#ffffff' }).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
}

function boxSize(body) {
  const w = Math.round(Number(body.width) || 600);
  const h = Math.round(Number(body.height) || 0);
  if (!(w >= 40 && w <= 800)) throw httpError(400, 'This image box size could not be read. Try again.');
  if (h && !(h >= 20 && h <= 2000)) throw httpError(400, 'Choose a height between 20 and 2000 px.');
  return { w, h };
}

/** Cut images are kept apart from the library and named by what they are, so the same cut is made only once. */
async function storeCut(buffer, sourceUrl, w, h) {
  const objectName = `cut/${crypto.createHash('sha256').update(`${sourceUrl}|${w}|${h}`).digest('hex').slice(0, 20)}.jpg`;
  const file = bucket.file(objectName);
  const [exists] = await file.exists();
  if (!exists) {
    await file.save(buffer, {
      resumable: false,
      contentType: 'image/jpeg',
      metadata: { cacheControl: 'public, max-age=31536000, immutable' }
    });
  }
  return `${cfg.libraryPrefix}${objectName}`;
}

function smallWarning(meta, w, h) {
  if (!meta || !meta.width || !meta.height) return null;
  if (meta.width < w || (h && meta.height < h)) {
    return `This image is small (${meta.width} × ${meta.height}) for a ${w}${h ? ` × ${h}` : ''} box and may look blurry. Use a bigger one if you can.`;
  }
  return null;
}

app.get('/editor/images', wrap(async (req, res) => {
  await editorTicket(req);
  const snap = await images.orderBy('uploadedAt', 'desc').limit(60).get();
  res.json({ images: snap.docs.map((d) => ({ name: d.data().name, url: d.data().url })) });
}));

/* form: image, width (box width in px), height (0 = keep the image's own shape) */
app.post('/editor/upload', wrap(async (req, res) => {
  const ticket = await editorTicket(req);
  await new Promise((resolve, reject) => {
    receivePhoto(req, res, (err) => {
      if (!err) return resolve();
      if (err.code === 'LIMIT_FILE_SIZE') return reject(tooBigError(httpError, Number(req.headers['content-length']) || 0));
      reject(httpError(400, 'The upload could not be read. Try again.'));
    });
  });
  if (!req.file) throw httpError(400, 'Choose an image to upload.');
  const { w, h } = boxSize(req.body);

  let original = req.file.buffer;
  let kind = sniff(original);
  let meta;
  try {
    meta = await sharp(original).metadata();
    if (!kind || meta.width > 1400) {
      original = await sharp(original, { limitInputPixels: 80e6 }).rotate().resize({ width: 1200, withoutEnlargement: true })
        .flatten({ background: '#ffffff' }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
      kind = { ext: 'jpg', type: 'image/jpeg' };
    }
  } catch (e) {
    throw httpError(415, 'This image could not be opened. Use a JPG, PNG or WebP image.');
  }

  /* The original always goes into the library, so the height can be changed again later without losing quality. */
  const saved = await storeLibraryImage(original, req.file.originalname, kind, ticket.email);
  let url = saved.url;
  if (h) url = await storeCut(await cutToBox(original, w, h), saved.url, w, h);
  res.json({ url, orig: saved.url, warning: smallWarning(meta, w, h) });
}));

/* body: { url (an image from the library), width, height } */
app.post('/editor/crop', wrap(async (req, res) => {
  await editorTicket(req);
  const body = req.body || {};
  const { w, h } = boxSize(body);
  if (!h) throw httpError(400, 'Choose a height first.');
  const source = String(body.url || '');
  if (!source.startsWith(cfg.libraryPrefix) || source.includes('..')) {
    throw httpError(400, 'A height can only be set on images from the image library. Upload the image here or pick it from the library.');
  }
  const name = decodeURIComponent(source.slice(cfg.libraryPrefix.length).split('?')[0]);
  let buffer;
  try {
    [buffer] = await bucket.file(name).download();
  } catch (e) {
    throw httpError(404, 'That image could not be found in the library.');
  }
  let out;
  let meta;
  try {
    meta = await sharp(buffer).metadata();
    out = await cutToBox(buffer, w, h);
  } catch (e) {
    throw httpError(415, 'This image could not be opened.');
  }
  res.json({ url: await storeCut(out, source, w, h), warning: smallWarning(meta, w, h) });
}));

/* body: { url } — Copy into library: an image from another website is copied into the library. */
app.post('/editor/import', wrap(async (req, res) => {
  const ticket = await editorTicket(req);
  const source = String((req.body && req.body.url) || '').trim();
  if (source.startsWith(cfg.libraryPrefix)) return res.json({ url: source, orig: source, already: true });
  const known = await images.where('sourceUrl', '==', source).limit(1).get();
  if (!known.empty) return res.json({ url: known.docs[0].data().url, orig: known.docs[0].data().url, already: true });
  let got;
  try {
    got = await fetchImage(source);
  } catch (e) {
    if (e.status === 413) throw httpError(413, `${e.message} Download it, make it smaller with the image reducer, then click Upload.`, { tooBig: true, size: e.size || null });
    throw httpError(e.status || 502, e.message);
  }
  let buffer = got.buffer;
  let kind = sniff(buffer);
  try {
    const meta = await sharp(buffer).metadata();
    if (!kind || meta.width > 1400) {
      buffer = await sharp(buffer, { limitInputPixels: 80e6 }).rotate().resize({ width: 1200, withoutEnlargement: true })
        .flatten({ background: '#ffffff' }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
      kind = { ext: 'jpg', type: 'image/jpeg' };
    }
  } catch (e) {
    throw httpError(415, 'That link is not an image that can be opened (JPG, PNG, GIF or WebP).');
  }
  const saved = await storeLibraryImage(buffer, got.name, kind, ticket.email, { sourceUrl: source });
  res.json({ url: saved.url, orig: saved.url });
}));

/* ---------- Customise window: everyone ---------- */

async function loadCustom(email) {
  const doc = await customs.doc(sha(email)).get();
  if (!doc.exists) return null;
  const d = doc.data();
  const at = d.createdAt && d.createdAt.toDate ? d.createdAt.toDate() : new Date(0);
  if (Date.now() - at.getTime() > CUSTOM_HOURS * 3600 * 1000) return null;
  return d;
}

/* body: { id } */
app.post('/api/customise-ticket', authenticate, wrap(async (req, res) => {
  const doc = await getTemplate(req.body && req.body.id);
  const d = doc.data();
  const access = accessFor(d, req.user, { admin: req.user.isAdmin });
  if (!access) throw httpError(404, d.hidden ? 'This template isn\u2019t available.' : 'This template is not published yet.');
  if (!req.user.isAdmin && access === 'published' && !seesCategory(req.user, await loadAccess(), d.category)) throw httpError(404, 'Template not found.');
  const ticket = await createTicket('customise', { email: req.user.email, templateId: doc.id, admin: Boolean(req.user.isAdmin) }, 120);
  res.json({ url: `${baseUrl(req)}/customise?ticket=${ticket}` });
}));

const CUSTOMISE_CSP = "default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'";

app.get('/customise', wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('Content-Security-Policy', CUSTOMISE_CSP);
  const ticket = await readTicket(req.query.ticket, 'customise');
  if (!ticket) return res.status(410).type('html').send(expiredPage('customise'));
  const doc = await templates.doc(ticket.templateId).get();
  const access = doc.exists ? accessFor(doc.data(), { email: ticket.email }, { admin: Boolean(ticket.admin) }) : null;
  if (!access) return res.status(404).type('html').send(unavailablePage());
  const d = doc.data();
  const marked = markBlocks(usableHtml(d, access));
  res.type('html').send(customisePage({
    ticket: req.query.ticket,
    name: d.name,
    category: d.category,
    html: marked.html,
    blocks: marked.blocks,
    locks: allLocks(access === 'shared' ? d.sharedLocks : d.locks, marked.blocks)
  }));
}));

async function customiseTicket(req) {
  const ticket = await readTicket(req.query.ticket, 'customise');
  if (!ticket) throw httpError(410, 'This tab has expired. Close it and click Customise in Gmail again.');
  return ticket;
}

const receivePhoto = multer({ storage: multer.memoryStorage(), limits: { fileSize: cfg.maxImageBytes, files: 1 } }).single('image');

/* form: image, w, h (box size in px), fit ('cover' or 'contain') */
app.post('/customise/image', wrap(async (req, res) => {
  const ticket = await customiseTicket(req);
  await new Promise((resolve, reject) => {
    receivePhoto(req, res, (err) => {
      if (!err) return resolve();
      if (err.code === 'LIMIT_FILE_SIZE') return reject(tooBigError(httpError, Number(req.headers['content-length']) || 0));
      reject(httpError(400, 'The photo could not be read. Try again.'));
    });
  });
  if (!req.file) throw httpError(400, 'Choose a photo.');

  const w = Math.round(Number(req.body.w));
  const h = Math.round(Number(req.body.h));
  if (!(w >= 20 && w <= 800 && h >= 10 && h <= 3000)) throw httpError(400, 'This box size could not be read. Reload the window and try again.');
  const fit = req.body.fit === 'contain' ? 'contain' : 'cover';
  let meta = null;
  try { meta = await sharp(req.file.buffer).metadata(); } catch (e) { meta = null; }

  /* Twice the box size for sharp screens, never wider than 1200 px. */
  const scale = Math.min(2, 1200 / w);
  const outW = Math.round(w * scale);
  const outH = Math.round(h * scale);

  let out;
  try {
    out = await sharp(req.file.buffer, { limitInputPixels: 80e6 })
      .rotate()
      .resize(outW, outH, { fit, position: 'attention', background: '#ffffff' })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer();
  } catch (e) {
    throw httpError(415, 'This photo could not be opened. Use a JPG, PNG or WebP photo.');
  }

  const month = new Date().toISOString().slice(0, 7);
  const objectName = `custom/${month}/${crypto.randomBytes(8).toString('hex')}.jpg`;
  await bucket.file(objectName).save(out, {
    resumable: false,
    contentType: 'image/jpeg',
    metadata: { cacheControl: 'public, max-age=31536000, immutable', metadata: { uploadedBy: ticket.email } },
    preconditionOpts: { ifGenerationMatch: 0 }
  });
  res.json({ url: `${cfg.libraryPrefix}${objectName}`, width: outW, height: outH, warning: smallWarning(meta, w, h) && 'This photo is small and may look blurry. Choose a bigger one if you can.' });
}));

/* body: { html, changes: ['i0', 't2'] } */
app.post('/customise/save', wrap(async (req, res) => {
  const ticket = await customiseTicket(req);
  const body = req.body || {};
  const html = String(body.html || '');
  if (!html.trim()) throw httpError(400, 'Nothing to save. Try again.');
  if (Buffer.byteLength(html) > cfg.gmailClipBytes) throw httpError(413, "This email is over Gmail's 102 KB limit. Shorten the text and try again.");
  const doc = await templates.doc(ticket.templateId).get();
  if (!doc.exists) throw httpError(404, 'Template not found.');
  const changes = Array.isArray(body.changes) ? body.changes.length : 0;
  await customs.doc(sha(ticket.email)).set({
    email: ticket.email,
    templateId: ticket.templateId,
    name: doc.data().name,
    html: cleanForEmail(html),
    changes,
    createdAt: FieldValue.serverTimestamp()
  });
  res.json({ ok: true, changes });
}));

app.get('/api/custom', authenticate, wrap(async (req, res) => {
  const custom = await loadCustom(req.user.email);
  if (!custom) throw httpError(404, 'Your customised email has expired. Click Customise again.');
  res.json({ templateId: custom.templateId, name: custom.name, changes: custom.changes || 0, html: custom.html });
}));

app.post('/api/custom/discard', authenticate, wrap(async (req, res) => {
  await customs.doc(sha(req.user.email)).delete();
  res.json({ ok: true });
}));

/* ---------- categories: admins ---------- */

app.get('/api/categories', authenticate, requireAdmin, wrap(async (req, res) => {
  const [access, snap] = await Promise.all([loadAccess(), templates.select('category').get()]);
  res.json(categoriesReply(access, snap));
}));

function categoriesReply(access, snap) {
  const counts = {};
  snap.docs.forEach((d) => {
    const key = String(d.data().category || '').toLowerCase();
    counts[key] = (counts[key] || 0) + 1;
  });
  const teams = access.teams;
  return {
    categories: access.list.map((c) => ({
      ...c,
      teams: (c.teams || []).filter((id) => teams.some((t) => t.id === id)),
      count: counts[c.name.toLowerCase()] || 0,
      audience: audienceText(c, teams)
    })),
    teams: teams.map((t) => ({ id: t.id, name: t.name, members: t.members }))
  };
}

/* ---------- teams: admins ---------- */

function teamsReply(teams, list) {
  return {
    teams: teams.map((t) => ({
      ...t,
      categories: list.filter((c) => !c.visible && (c.teams || []).includes(t.id)).map((c) => c.name)
    }))
  };
}

app.get('/api/teams', authenticate, requireAdmin, wrap(async (req, res) => {
  const access = await loadAccess();
  res.json(teamsReply(access.teams, access.list));
}));

/* body (one at a time): { create }, { rename: { id, name } }, { remove: { id } }, { addMembers: { id, emails } }, { removeMember: { id, email } } */
app.post('/api/teams', authenticate, requireAdmin, wrap(async (req, res) => {
  const body = req.body || {};
  const out = await db.runTransaction(async (tx) => {
    const [tDoc, cDoc] = await Promise.all([tx.get(teamsDoc), tx.get(categoriesDoc)]);
    const before = teamsLib.normalise(tDoc.exists ? tDoc.data().list : null);
    const { list, created } = teamsLib.applyChanges(before, body);
    tx.set(teamsDoc, { list, updatedBy: req.user.email, updatedAt: FieldValue.serverTimestamp() });
    let categoryList = cats.normalise(cDoc.exists ? cDoc.data().list : null);
    /* A deleted team is taken off every category too. */
    if (body.remove && categoryList.some((c) => (c.teams || []).includes(body.remove.id))) {
      categoryList = categoryList.map((c) => ({ ...c, teams: (c.teams || []).filter((id) => id !== body.remove.id) }));
      tx.set(categoriesDoc, { list: categoryList, updatedBy: req.user.email, updatedAt: FieldValue.serverTimestamp() });
    }
    return { list, created, categoryList };
  });
  console.log(`Teams changed by ${req.user.email}: ${Object.keys(body).join(', ')}`);
  res.json({ ...teamsReply(out.list, out.categoryList), created: out.created ? out.created.id : null });
}));

/* ---------- hiding a template (admins still see it) ---------- */

/* body: { hidden: true|false } */
app.post('/api/templates/:id/hidden', authenticate, requireAdmin, wrap(async (req, res) => {
  const doc = await getTemplate(req.params.id);
  const hidden = Boolean(req.body && req.body.hidden);
  await doc.ref.update({ hidden, hiddenBy: req.user.email, hiddenAt: FieldValue.serverTimestamp() });
  console.log(`Template "${doc.data().name}" (${doc.id}) ${hidden ? 'hidden' : 'shown again'} by ${req.user.email}`);
  res.json({ hidden, template: await freshTemplate(doc.id, req) });
}));

/* Templates in a category: moved when a category is renamed or deleted. */
async function moveTemplates(fromName, toName) {
  const snap = await templates.where('category', '==', fromName).select().get();
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch();
    snap.docs.slice(i, i + 400).forEach((d) => batch.update(d.ref, { category: toName }));
    await batch.commit();
  }
  return snap.size;
}

/*
 * body (one at a time):
 *   { set: { name, visible } }        switch one category on or off (older add-on versions)
 *   { audience: { name, everyone, teams: [ids], people: [emails] } }   who can see it
 *   { add: 'New name' }               add a category
 *   { rename: { from, to } }          rename (its templates follow)
 *   { remove: { name, moveTo } }      delete; templates in it move to moveTo
 *   { visible: [...] }                (older add-on versions)
 */
app.post('/api/categories', authenticate, requireAdmin, wrap(async (req, res) => {
  const body = req.body || {};
  if (body.remove) {
    const current = cats.normalise((await categoriesDoc.get()).data()?.list);
    const hit = cats.findCategory(current, body.remove.name);
    if (!hit) throw httpError(404, 'That category no longer exists. Click Refresh.');
    const used = (await templates.where('category', '==', hit.name).select().get()).size;
    if (used) {
      const to = cats.findCategory(current, body.remove.moveTo);
      if (!to || to.name === hit.name) {
        throw httpError(409, `${used} template${used === 1 ? ' uses' : 's use'} "${hit.name}". Choose a category to move ${used === 1 ? 'it' : 'them'} to, then delete.`, { used });
      }
      await moveTemplates(hit.name, to.name);
    }
  }
  let renamed = null;
  const teams = await loadTeams();
  if (body.audience && typeof body.audience === 'object') body.audience.knownTeams = teams.map((t) => t.id);
  const list = await db.runTransaction(async (tx) => {
    const doc = await tx.get(categoriesDoc);
    const before = cats.normalise(doc.exists ? doc.data().list : null);
    const next = cats.applyChanges(before, body);
    if (body.rename) {
      const from = cats.findCategory(before, body.rename.from);
      const idx = before.indexOf(from);
      renamed = { from: from.name, to: next[idx].name };
    }
    tx.set(categoriesDoc, { list: next, updatedBy: req.user.email, updatedAt: FieldValue.serverTimestamp() });
    return next;
  });
  if (renamed && renamed.from !== renamed.to) await moveTemplates(renamed.from, renamed.to);
  if (body.audience) console.log(`Category "${body.audience.name}" audience changed by ${req.user.email}`);
  res.json(categoriesReply({ list, teams }, await templates.select('category').get()));
}));

/* ---------- images: admins ---------- */

/** Which templates use each image link (looks at the saved, published and shared code). */
async function imageUsage() {
  const snap = await templates.select('name', 'sourceHtml', 'publishedHtml', 'sharedHtml').get();
  return snap.docs.map((t) => ({ name: t.data().name, code: `${t.data().sourceHtml || ''} ${t.data().publishedHtml || ''} ${t.data().sharedHtml || ''}` }));
}

function usedInFor(usage, url) {
  return url ? usage.filter((t) => t.code.includes(url)).map((t) => t.name).sort((a, b) => a.localeCompare(b)) : [];
}

app.get('/api/images', authenticate, requireAdmin, wrap(async (req, res) => {
  const [snap, usage] = await Promise.all([images.orderBy('uploadedAt', 'desc').limit(200).get(), imageUsage()]);
  const q = String(req.query.q || '').trim().toLowerCase();
  const items = snap.docs
    .map((d) => ({ id: d.id, name: d.data().name, url: d.data().url, size: d.data().size, uploadedAt: iso(d.data().uploadedAt), uploadedBy: d.data().uploadedBy || '', usedIn: usedInFor(usage, d.data().url) }))
    .filter((i) => !q || i.name.toLowerCase().includes(q));
  res.json({ images: items });
}));

/*
 * Deletes an image from the library list, even when templates use it.
 * The file itself stays online, so templates, their old versions, people's
 * customised copies and emails already sent keep showing the picture.
 */
app.post('/api/images/remove', authenticate, requireAdmin, wrap(async (req, res) => {
  const id = String((req.body && req.body.id) || '');
  if (!id) throw httpError(400, 'Choose an image.');
  const doc = await images.doc(id).get();
  if (!doc.exists) throw httpError(404, 'That image is already gone.');
  const usedIn = usedInFor(await imageUsage(), doc.data().url);
  await doc.ref.delete();
  console.log(`Image ${doc.data().name} removed from the library by ${req.user.email} (used in ${usedIn.length} templates; the file stays online)`);
  res.json({ ok: true, name: doc.data().name, usedIn });
}));

app.post('/api/upload-ticket', authenticate, requireAdmin, wrap(async (req, res) => {
  const ticket = await createTicket('upload', { email: req.user.email }, cfg.ticketMinutes);
  res.json({ url: `${baseUrl(req)}/upload?ticket=${ticket}`, minutes: cfg.ticketMinutes });
}));

app.get('/upload', wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('Content-Security-Policy', "default-src 'none'; img-src 'self' https://storage.googleapis.com; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'");
  const ticket = await readTicket(req.query.ticket, 'upload');
  if (!ticket) return res.status(410).type('html').send(expiredPage('upload'));
  res.type('html').send(uploadPage(req.query.ticket));
}));

const receive = multer({ storage: multer.memoryStorage(), limits: { fileSize: cfg.maxImageBytes, files: 1 } }).single('image');

/** Saves an image in the shared image library and returns its permanent link. */
async function storeLibraryImage(buffer, originalName, kind, email, extra) {
  const base = String(originalName || 'image')
    .replace(/\.[^.]*$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'image';
  const objectName = `${base}-${crypto.randomBytes(3).toString('hex')}.${kind.ext}`;
  await bucket.file(objectName).save(buffer, {
    resumable: false,
    contentType: kind.type,
    metadata: { cacheControl: 'public, max-age=31536000, immutable' },
    preconditionOpts: { ifGenerationMatch: 0 }
  });
  const url = `${cfg.libraryPrefix}${objectName}`;
  await images.add(Object.assign({ name: objectName, url, size: buffer.length, contentType: kind.type, uploadedBy: email, uploadedAt: FieldValue.serverTimestamp() }, extra || {}));
  return { objectName, url };
}

function sniff(buf) {
  if (buf.length >= 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', type: 'image/png' };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.slice(0, 6).toString('latin1'))) return { ext: 'gif', type: 'image/gif' };
  return null;
}

app.post('/upload', wrap(async (req, res) => {
  const ticket = await readTicket(req.query.ticket, 'upload');
  if (!ticket) throw httpError(410, 'This upload link has expired. Click Upload image in the add-on again.');

  await new Promise((resolve, reject) => {
    receive(req, res, (err) => {
      if (!err) return resolve();
      if (err.code === 'LIMIT_FILE_SIZE') return reject(tooBigError(httpError, Number(req.headers['content-length']) || 0));
      reject(httpError(400, 'The upload could not be read. Try again.'));
    });
  });
  if (!req.file) throw httpError(400, 'Choose an image to upload.');

  const kind = sniff(req.file.buffer);
  if (!kind) throw httpError(415, 'Only JPG, PNG or GIF images can be uploaded.');

  const { objectName, url } = await storeLibraryImage(req.file.buffer, req.file.originalname, kind, ticket.email);
  res.json({ name: objectName, url, size: req.file.size, warning: null });
}));

/* ---------- errors ---------- */

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || (err.type === 'entity.too.large' ? 413 : 500);
  if (status >= 500) console.error(err);
  const message = status >= 500 ? 'Something went wrong. Try again.' : err.message;
  res.status(status).json({ error: message, ...(err.extra || {}) });
});

if (require.main === module) {
  app.listen(cfg.port, () => console.log(`Template engine listening on ${cfg.port}`));
}

module.exports = app;
