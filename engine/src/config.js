'use strict';

const list = (v) => (v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

const bucket = process.env.IMAGE_BUCKET || 'your-image-bucket';

module.exports = {
  port: Number(process.env.PORT) || 8080,
  projectNumber: process.env.PROJECT_NUMBER || '',
  oauthClientId: process.env.OAUTH_CLIENT_ID || '',
  domain: (process.env.ALLOWED_DOMAIN || 'example.com').toLowerCase(),
  adminGroup: (process.env.ADMIN_GROUP || '').toLowerCase(),
  adminEmails: list(process.env.ADMIN_EMAILS),
  bucket,
  libraryPrefix: `https://storage.googleapis.com/${bucket}/`,
  databaseId: process.env.FIRESTORE_DB || 'templates',
  categories: ['Events', 'Sales', 'Newsletters', 'HR', 'General'],
  defaultVisibleCategories: ['Sales', 'Newsletters', 'HR'],
  fontStack: 'Arial, Helvetica, sans-serif',
  maxSourceBytes: 500 * 1024,
  gmailClipBytes: 102 * 1024,
  gmailWarnBytes: 80 * 1024,
  /* Every image upload (library, editor, Customise, Copy into library) must be 1 MB or smaller. */
  maxImageBytes: 1024 * 1024,
  maxShare: 25,
  ticketMinutes: 10
};
