'use strict';

/**
 * Sharing a template with named people instead of everyone.
 * A template is in one of three states for a user:
 *   published  everyone can use it
 *   shared     only the people on its list can use it (a fixed copy, made when it was shared)
 *   neither    only admins can see it (a draft)
 */

const cfg = require('./config');
const { httpError } = require('./auth');

/** Who a template is shared with (only while it is not published for everyone). */
function sharedList(d) {
  return d.status !== 'published' && Array.isArray(d.sharedWith) ? d.sharedWith : [];
}

/** How this person may use a template: 'published' (everyone), 'shared' (named for them) or null. */
function accessFor(d, user) {
  if (d.status === 'published' && d.publishedHtml) return 'published';
  /* sharedAt is set together with the shared copy, so a list without a copy never gives access. */
  if (d.sharedAt && sharedList(d).includes(String(user.email || '').toLowerCase())) return 'shared';
  return null;
}

/** The email-ready code this person gets: the published version, or the copy shared with them. */
function usableHtml(d, access) {
  return access === 'shared' ? d.sharedHtml : d.publishedHtml;
}

function cleanShareList(value, domain = cfg.domain, max = cfg.maxShare) {
  const list = Array.isArray(value) ? value : [];
  const out = [];
  list.forEach((v) => {
    const email = String(v || '').trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/.test(email)) throw httpError(400, `"${String(v).slice(0, 80)}" is not an email address.`);
    if (domain && !email.endsWith(`@${domain}`)) throw httpError(400, `Only ${domain} addresses can be added. "${email}" is not one.`);
    if (!out.includes(email)) out.push(email);
  });
  if (out.length > max) throw httpError(400, `A template can be shared with up to ${max} people. To give it to more, publish it for everyone.`);
  return out;
}

module.exports = { sharedList, accessFor, usableHtml, cleanShareList };
