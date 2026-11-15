/**
 * Custom Email Template Builder — Gmail add-on ("Template Gallery").
 *
 * Opens in two places:
 *   1. The right side panel of Gmail (click the add-on icon on the right edge).
 *      Full height. "Add to email" opens a new email with the template in it.
 *   2. The small box inside the Compose window (the add-on icon at the bottom).
 *      "Add to email" puts the template into the email you are writing.
 *
 * Everyone:  categories, thumbnails, Preview, Customise (change the photos and
 *            text the admin allowed, without breaking the layout), Add to email.
 * Admins:    (members of the admin Google Group set on the engine) also get
 *            New template, Upload image, Images, Categories, Edit,
 *            Open editor (a tab to build with blocks or paste HTML), Publish for everyone,
 *            Make a copy, Versions (restore an earlier one), Categories (switch,
 *            rename, delete), Images (upload, remove),
 *            Unpublish and Delete.
 *
 * Built by Legends (@nexoradev-stack), with Claude (Anthropic) and Cursor.
 */

/* ================= Settings: change these for your company ================= */

/** Your engine's Cloud Run address (no slash at the end). Also put it in appsscript.json. */
var API_BASE = 'https://YOUR-ENGINE-URL.a.run.app';
/** The name people see in the panel. */
var APP_NAME = 'Template Gallery';
/** Your brand colour for buttons, and a darker shade of it for headings. */
var BLUE = '#6C3BFF';
var BLUE_DARK = '#5B32D6';

/* ========================================================================== */

var ASSETS = API_BASE + '/assets/';
var GREY = '#5F6368';
var MAX_LIST = 20;

/* =========================================================
 * Entry points
 * ========================================================= */

/** true when the add-on is open in Gmail's right side panel. */
var SIDE = false;

/** true when an admin has switched to "View as user" (sees exactly what users see). */
var AS_USER = false;

/** Right side panel of Gmail (the add-on icon on the right edge). */
function onHomepage(e) {
  SIDE = true;
  AS_USER = false;
  return buildGalleryCard_({});
}

/** Small box inside the Compose window. */
function onCompose(e) {
  SIDE = false;
  AS_USER = false;
  return [buildGalleryCard_({})];
}

/** Every button click starts here: remembers which of the two places we are in. */
function init_(e) {
  SIDE = param_(e, 'side') === '1';
  AS_USER = param_(e, 'asUser') === '1';
}

/** Admins: switch to the user view, and back. */
function viewAsUser(e) {
  init_(e);
  AS_USER = true;
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().popToRoot().updateCard(buildGalleryCard_({})))
    .setNotification(CardService.newNotification().setText('You now see exactly what users see.'))
    .build();
}

function backToAdmin(e) {
  init_(e);
  AS_USER = false;
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().popToRoot().updateCard(buildGalleryCard_({})))
    .build();
}

/* =========================================================
 * Template Gallery (everyone; admins get extra tools)
 * ========================================================= */

function buildGalleryCard_(state) {
  state = state || {};
  var data;
  try {
    var qs = '?q=' + encodeURIComponent(state.q || '') + '&category=' + encodeURIComponent(state.category || '');
    data = api_('get', '/api/templates' + qs);
  } catch (err) {
    return errorCard_(err);
  }
  var admin = Boolean(data.isAdmin);
  var items = data.templates || [];
  var categories = data.categories || [];

  var card = CardService.newCardBuilder().setName('gallery');

  if (data.viewingAsUser) {
    card.addSection(CardService.newCardSection()
      .addWidget(CardService.newDecoratedText()
        .setTopLabel('ADMIN')
        .setText('Viewing as a user')
        .setWrapText(true)
        .setButton(button_('Back to admin', 'backToAdmin', {}))));
  }

  if (data.custom) card.addSection(readySection_(data.custom));

  if (admin) {
    card.addSection(CardService.newCardSection()
      .addWidget(CardService.newButtonSet()
        .addButton(button_('New template', 'openEditor', {}, 'filled'))
        .addButton(button_('Upload image', 'openUpload', {})))
      .addWidget(CardService.newButtonSet()
        .addButton(button_('Images', 'showImages', {}))
        .addButton(button_('Categories', 'showCategories', {})))
      .addWidget(CardService.newButtonSet()
        .addButton(CardService.newTextButton()
          .setText('Refresh')
          .setTextButtonStyle(CardService.TextButtonStyle.BORDERLESS)
          .setOnClickAction(action_('goHome', {})))
        .addButton(CardService.newTextButton()
          .setText('View as user')
          .setTextButtonStyle(CardService.TextButtonStyle.BORDERLESS)
          .setOnClickAction(action_('viewAsUser', {})))));
  }

  /* Search is for admins only. Users just pick a category. */
  var filters = CardService.newCardSection();
  if (admin) {
    filters.addWidget(CardService.newTextInput()
      .setFieldName('q')
      .setTitle('Search, including drafts')
      .setValue(state.q || '')
      .setOnChangeAction(action_('onSearch', { category: state.category || '' })));
  }
  filters.addWidget(categoryGrid_(categories, state.category || '', state.q || '', admin));
  card.addSection(filters);

  if (!items.length) {
    card.addSection(CardService.newCardSection().addWidget(CardService.newTextParagraph().setText(
      state.q || state.category ? 'No templates found here.'
        : admin ? 'No templates yet. Click New template to add one.' : 'No templates yet.')));
  }

  var shown = items.slice(0, MAX_LIST);
  groupByCategory_(shown).forEach(function (g) {
    var section = CardService.newCardSection().setHeader('<font color="' + BLUE_DARK + '"><b>' + esc_(g.category.toUpperCase()) + '</b></font>');
    g.items.forEach(function (t) {
      if (admin) addAdminRow_(section, t);
      else addUserCard_(section, t);
    });
    card.addSection(section);
  });

  if (items.length > shown.length) {
    card.addSection(CardService.newCardSection().addWidget(CardService.newTextParagraph()
      .setText('<font color="' + GREY + '">Showing ' + shown.length + ' of ' + items.length + '. Pick a category to find the rest.</font>')));
  }

  if (!admin && items.length) {
    card.addSection(CardService.newCardSection().addWidget(CardService.newTextParagraph()
      .setText('<font color="#0D652D">Thank you for using the ' + esc_(APP_NAME) + '</font>')));
  }

  return card.build();
}

function addUserCard_(section, t) {
  section.addWidget(CardService.newImage()
    .setImageUrl(t.thumbUrl)
    .setAltText('Preview of ' + t.name)
    .setOnClickAction(action_('openPreview', { id: t.id })));
  section.addWidget(CardService.newDecoratedText()
    .setText(esc_(t.name))
    .setBottomLabel('Updated ' + formatDate_(t.updatedAt))
    .setWrapText(true));
  section.addWidget(CardService.newButtonSet()
    .addButton(button_('Preview', 'openPreview', { id: t.id }))
    .addButton(button_('Customise', 'openCustomise', { id: t.id, name: t.name }))
    .addButton(addButton_(t.id, 'filled')));
  section.addWidget(tip_());
  section.addWidget(CardService.newDivider());
}

function addAdminRow_(section, t) {
  var row = CardService.newDecoratedText()
    .setStartIcon(CardService.newIconImage().setIconUrl(t.thumbUrl).setAltText(t.name))
    .setTopLabel(statusLabel_(t) + (t.version ? ' · v' + t.version : ''))
    .setText(esc_(t.name))
    .setBottomLabel('Updated ' + formatDate_(t.updatedAt))
    .setWrapText(true)
    .setButton(button_('Edit', 'showEditor', { id: t.id }));
  section.addWidget(row);
}

function groupByCategory_(items) {
  var order = [];
  var map = {};
  items.forEach(function (t) {
    if (!map[t.category]) { map[t.category] = []; order.push(t.category); }
    map[t.category].push(t);
  });
  return order.map(function (c) { return { category: c, items: map[c] }; });
}

function onSearch(e) {
  init_(e);
  return updateCard_(buildGalleryCard_({ q: input_(e, 'q'), category: param_(e, 'category') }));
}

function onCategory(e) {
  init_(e);
  var picked = param_(e, 'grid_item_identifier') || param_(e, 'pick');
  var category = picked.indexOf('c:') === 0 ? picked.slice(2) : '';
  return updateCard_(buildGalleryCard_({ q: param_(e, 'q'), category: category }));
}

function goHome(e) {
  init_(e);
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().popToRoot().updateCard(buildGalleryCard_({})))
    .build();
}

/* ---------- categories, two per row ---------- */

function categoryGrid_(categories, selected, q, admin) {
  var entries = [{ id: 'c:', label: 'All', on: !selected }];
  categories.forEach(function (c) {
    entries.push({
      id: 'c:' + c.name,
      label: c.name,
      on: c.name.toLowerCase() === String(selected).toLowerCase()
    });
  });
  try {
    var grid = CardService.newGrid()
      .setNumColumns(2)
      .setBorderStyle(CardService.newBorderStyle()
        .setType(CardService.BorderType.STROKE)
        .setCornerRadius(8)
        .setStrokeColor('#747775'))
      .setOnClickAction(action_('onCategory', { q: q }));
    entries.forEach(function (c) {
      grid.addItem(CardService.newGridItem()
        .setIdentifier(c.id)
        .setTitle((c.on ? '✓ ' : '') + c.label)
        .setTextAlignment(CardService.HorizontalAlignment.CENTER));
    });
    return grid;
  } catch (gridErr) {
    /* Grid not available: fall back to plain buttons. */
    var set = CardService.newButtonSet();
    entries.forEach(function (c) {
      set.addButton(button_(c.label, 'onCategory', { pick: c.id, q: q }, c.on ? 'filled' : 'outlined'));
    });
    return set;
  }
}

/* =========================================================
 * Preview pop-up and Add to email
 * ========================================================= */

function openPreview(e) {
  init_(e);
  try {
    var ticket = api_('post', '/api/preview-ticket', { id: param_(e, 'id'), draft: param_(e, 'draft') === '1' });
    return CardService.newActionResponseBuilder()
      .setOpenLink(CardService.newOpenLink()
        .setUrl(ticket.url)
        .setOpenAs(CardService.OpenAs.OVERLAY)
        .setOnClose(CardService.OnClose.NOTHING))
      .build();
  } catch (err) {
    return notify_(err.message);
  }
}

function addToEmail(e) {
  init_(e);
  try {
    var id = param_(e, 'id');
    var t = api_('get', '/api/templates/' + encodeURIComponent(id));
    if (!t.html) return notify_('This template is not published yet.');
    return insertHtml_(t.html);
  } catch (err) {
    return notify_(err.message);
  }
}

/** Side panel: opens a new email with the template already inside it. */
function addToNewEmail(e) {
  init_(e);
  /* Gmail gives the add-on a short-lived pass to create this one email. */
  var token = (e && e.gmail && e.gmail.accessToken) || (e && e.messageMetadata && e.messageMetadata.accessToken) || '';
  if (token) GmailApp.setCurrentMessageAccessToken(token);
  var t = api_('get', '/api/templates/' + encodeURIComponent(param_(e, 'id')));
  if (!t.html) throw new Error('This template is not published yet.');
  var draft = GmailApp.createDraft('', '', '', { htmlBody: t.html });
  return CardService.newComposeActionResponseBuilder().setGmailDraft(draft).build();
}

/** The "Add to email" button: new email in the side panel, insert in the Compose box. */
function addButton_(id, style) {
  if (!SIDE) return button_('Add to email', 'addToEmail', { id: id }, style);
  var b = CardService.newTextButton()
    .setText('Add to email')
    .setComposeAction(action_('addToNewEmail', { id: id }), CardService.ComposedEmailType.STANDALONE_DRAFT);
  if (style === 'filled') {
    b.setTextButtonStyle(CardService.TextButtonStyle.FILLED).setBackgroundColor(BLUE);
  } else {
    try { b.setTextButtonStyle(CardService.TextButtonStyle.OUTLINED); } catch (err) { /* default style */ }
  }
  return b;
}

/* ---------- Customise: the user's own copy of a template ---------- */

/** Opens the Customise window. When it closes, the add-on reloads and shows the ready email. */
function openCustomise(e) {
  init_(e);
  try {
    var id = param_(e, 'id');
    var ticket = api_('post', '/api/customise-ticket', { id: id });
    return CardService.newActionResponseBuilder()
      .setOpenLink(tabLink_(ticket.url))
      .setNavigation(CardService.newNavigation().pushCard(customisingCard_(id, param_(e, 'name'))))
      .build();
  } catch (err) { return notify_(err.message); }
}

/** Opens a page in a normal browser tab. The panel stays usable while it is open. */
function tabLink_(url) {
  return CardService.newOpenLink()
    .setUrl(url)
    .setOpenAs(CardService.OpenAs.FULL_SIZE)
    .setOnClose(CardService.OnClose.NOTHING);
}

/** Shown in the panel while the user customises in the other tab. */
function customisingCard_(id, name) {
  return CardService.newCardBuilder().setName('customising')
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newDecoratedText()
        .setTopLabel('CUSTOMISING')
        .setText(esc_(name || 'Your template'))
        .setWrapText(true))
      .addWidget(CardService.newTextParagraph().setText(
        '1. Change the photos and text in the new tab.<br>' +
        '2. Click <b>Use in my email</b> there.<br>' +
        '3. Come back here and click <b>Add to email</b>.'))
      .addWidget(CardService.newButtonSet()
        .addButton(customAddButton_())
        .addButton(button_('Open again', 'openCustomise', { id: id, name: name || '' })))
      .addWidget(CardService.newTextButton()
        .setText('Back to gallery')
        .setTextButtonStyle(CardService.TextButtonStyle.BORDERLESS)
        .setOnClickAction(action_('goHome', {}))))
    .build();
}

/** "Add to email" for the user's customised copy: new email in the side panel, insert in the Compose box. */
function customAddButton_() {
  if (!SIDE) return button_('Add to email', 'addCustomToEmail', {}, 'filled');
  return CardService.newTextButton()
    .setText('Add to email')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setBackgroundColor(BLUE)
    .setComposeAction(action_('addCustomToNewEmail', {}), CardService.ComposedEmailType.STANDALONE_DRAFT);
}

/** "Your customised email is ready" box at the top of the gallery. */
function readySection_(custom) {
  var changes = custom.changes || 0;
  var add = customAddButton_();
  return CardService.newCardSection()
    .addWidget(CardService.newDecoratedText()
      .setTopLabel('<font color="#0D652D">YOUR CUSTOMISED EMAIL IS READY</font>')
      .setText(esc_(custom.name))
      .setBottomLabel(changes === 1 ? '1 part changed' : changes + ' parts changed')
      .setWrapText(true))
    .addWidget(CardService.newButtonSet()
      .addButton(button_('Discard', 'discardCustom', {}))
      .addButton(add));
}

/** Side panel: opens a new email with the customised template in it. */
function addCustomToNewEmail(e) {
  init_(e);
  var token = (e && e.gmail && e.gmail.accessToken) || (e && e.messageMetadata && e.messageMetadata.accessToken) || '';
  if (token) GmailApp.setCurrentMessageAccessToken(token);
  var c;
  try { c = api_('get', '/api/custom'); } catch (err) {
    throw new Error('Nothing to add yet. In the Customise tab, click "Use in my email" first, then try again.');
  }
  var draft = GmailApp.createDraft('', '', '', { htmlBody: c.html });
  return CardService.newComposeActionResponseBuilder().setGmailDraft(draft).build();
}

/** Compose box: puts the customised template into the email being written. */
function addCustomToEmail(e) {
  init_(e);
  try { return insertHtml_(api_('get', '/api/custom').html); } catch (err) { return notify_(err.message); }
}

function discardCustom(e) {
  init_(e);
  try {
    api_('post', '/api/custom/discard', {});
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().popToRoot().updateCard(buildGalleryCard_({})))
      .setNotification(CardService.newNotification().setText('Discarded your customised email.'))
      .build();
  } catch (err) { return notify_(err.message); }
}

function insertHtml_(html) {
  return CardService.newUpdateDraftActionResponseBuilder()
    .setUpdateDraftBodyAction(CardService.newUpdateDraftBodyAction()
      .addUpdateContent(html, CardService.ContentType.MUTABLE_HTML)
      .setUpdateType(CardService.UpdateDraftBodyType.IN_PLACE_INSERT))
    .build();
}

/* =========================================================
 * Create / edit and publish (admins)
 * ========================================================= */

/**
 * Opens the full-size editor window (big code box + live preview).
 * The code is typed and saved there, never in the small Gmail panel.
 */
function openEditor(e) {
  init_(e);
  try {
    var ticket = api_('post', '/api/editor-ticket', { id: param_(e, 'id') || undefined });
    return CardService.newActionResponseBuilder()
      .setOpenLink(tabLink_(ticket.url))
      .setNotification(CardService.newNotification().setText('The editor opened in a new tab. Click Refresh here when you are done.'))
      .build();
  } catch (err) { return notify_(err.message); }
}

/** The template's page in the panel: status, checks and the actions. */
function showEditor(e) {
  init_(e);
  try {
    var t = api_('get', '/api/templates/' + encodeURIComponent(param_(e, 'id')));
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(buildEditorCard_(t)))
      .build();
  } catch (err) { return notify_(err.message); }
}

function buildEditorCard_(t) {
  var id = t.id || '';
  var params = { id: id };
  var card = CardService.newCardBuilder().setName('editor');

  card.addSection(CardService.newCardSection()
    .addWidget(CardService.newDecoratedText()
      .setTopLabel(esc_(t.category || ''))
      .setText(esc_(t.name || ''))
      .setBottomLabel(statusText_(t))
      .setWrapText(true)
      .setButton(CardService.newTextButton()
        .setText('Back to gallery')
        .setTextButtonStyle(CardService.TextButtonStyle.BORDERLESS)
        .setOnClickAction(action_('goHome', {}))))
    .addWidget(CardService.newButtonSet()
      .addButton(button_('Open editor', 'openEditor', params, 'filled'))
      .addButton(button_('Preview', 'previewDraft', params)))
    .addWidget(CardService.newTextParagraph().setText('<font color="' + GREY + '">Open editor opens a new tab: build with blocks or paste HTML. Name, category and what users can change are set there too. Click Refresh here after saving.</font>'))
    .addWidget(CardService.newTextButton()
      .setText('Refresh')
      .setTextButtonStyle(CardService.TextButtonStyle.BORDERLESS)
      .setOnClickAction(action_('refreshEditor', params))));

  if (t.checks && t.checks.length) card.addSection(checksSection_(t.checks));

  var publish = CardService.newCardSection();
  publish.addWidget(CardService.newTextParagraph().setText('<font color="' + GREY + '">' + (
    t.status === 'published'
      ? (t.hasUnpublishedChanges ? 'You have saved changes users do not see yet. Publish again to update everyone.' : 'Live for everyone.')
      : 'Only admins can see this until you publish. Publishing also creates the thumbnail.') + '</font>'));
  publish.addWidget(CardService.newButtonSet().addButton(button_('Publish for everyone', 'publishTemplate', params, 'filled')));
  if (t.status === 'published') {
    publish.addWidget(CardService.newButtonSet()
      .addButton(addButton_(id))
      .addButton(button_('Customise', 'openCustomise', { id: id, name: t.name || '' }))
      .addButton(button_('Unpublish', 'unpublishTemplate', params)));
    publish.addWidget(tip_());
  }
  publish.addWidget(CardService.newButtonSet()
    .addButton(button_('Make a copy', 'copyTemplate', { id: id }))
    .addButton(button_('Versions', 'showVersions', { id: id, name: t.name || '' }))
    .addButton(button_('Delete template', 'confirmDelete', { id: id, name: t.name || '' })));
  card.addSection(publish);

  return card.build();
}

function statusText_(t) {
  if (t.status === 'published') return 'Published · v' + (t.version || 1) + (t.hasUnpublishedChanges ? ' · changes not live' : '');
  if (t.status === 'unpublished') return 'Unpublished · hidden from users';
  return 'Draft · only admins can see it';
}

function checksSection_(checks) {
  var errors = checks.filter(function (c) { return c.level === 'error'; }).length;
  var warns = checks.filter(function (c) { return c.level === 'warn'; }).length;
  var section = CardService.newCardSection().setHeader('<b>Gmail check</b> · ' + (errors ? errors + ' must fix' : warns ? warns + ' to review' : 'all good'));
  checks.forEach(function (c) {
    var mark = c.level === 'error' ? '<font color="#C5221F"><b>Fix:</b></font> '
      : c.level === 'warn' ? '<font color="#B06000"><b>Check:</b></font> '
      : '<font color="#137333"><b>✓</b></font> ';
    section.addWidget(CardService.newTextParagraph().setText(mark + esc_(c.message)));
  });
  return section;
}

function reloadEditor_(id, message) {
  var t = api_('get', '/api/templates/' + encodeURIComponent(id));
  var builder = CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildEditorCard_(t)));
  if (message) builder.setNotification(CardService.newNotification().setText(message));
  return builder.build();
}

function refreshEditor(e) {
  init_(e);
  try { return reloadEditor_(param_(e, 'id'), 'Refreshed.'); } catch (err) { return notify_(err.message); }
}

function previewDraft(e) {
  init_(e);
  try {
    var ticket = api_('post', '/api/preview-ticket', { id: param_(e, 'id'), draft: true });
    return CardService.newActionResponseBuilder()
      .setOpenLink(CardService.newOpenLink()
        .setUrl(ticket.url)
        .setOpenAs(CardService.OpenAs.OVERLAY)
        .setOnClose(CardService.OnClose.NOTHING))
      .build();
  } catch (err) { return notify_(err.message); }
}

function publishTemplate(e) {
  init_(e);
  var id = param_(e, 'id');
  try {
    var result = api_('post', '/api/templates/' + encodeURIComponent(id) + '/publish', {});
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().popToRoot().updateCard(buildGalleryCard_({})))
      .setNotification(CardService.newNotification().setText('Published (v' + result.version + '). Everyone can use it now.'))
      .build();
  } catch (err) {
    if (err.code === 422) {
      try { return reloadEditor_(id, err.message); } catch (inner) { /* fall through */ }
    }
    return notify_(err.message);
  }
}

function unpublishTemplate(e) {
  init_(e);
  try {
    var id = param_(e, 'id');
    api_('post', '/api/templates/' + encodeURIComponent(id) + '/unpublish', {});
    return reloadEditor_(id, 'Unpublished. Users no longer see this template.');
  } catch (err) { return notify_(err.message); }
}

/* ---------- make a copy ---------- */

function copyTemplate(e) {
  init_(e);
  try {
    var made = api_('post', '/api/templates/' + encodeURIComponent(param_(e, 'id')) + '/copy', {});
    var t = api_('get', '/api/templates/' + encodeURIComponent(made.id));
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(buildEditorCard_(t)))
      .setNotification(CardService.newNotification().setText('Made "' + made.name + '". Click Open editor to rename it and choose its category.'))
      .build();
  } catch (err) { return notify_(err.message); }
}

/* ---------- versions and restore ---------- */

function showVersions(e) {
  init_(e);
  try {
    var id = param_(e, 'id');
    var data = api_('get', '/api/templates/' + encodeURIComponent(id) + '/versions');
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(buildVersionsCard_(id, param_(e, 'name'), data)))
      .build();
  } catch (err) { return notify_(err.message); }
}

function buildVersionsCard_(id, name, data) {
  var card = CardService.newCardBuilder().setName('versions');
  card.addSection(CardService.newCardSection()
    .addWidget(CardService.newDecoratedText()
      .setTopLabel('VERSIONS')
      .setText(esc_(name || 'Template'))
      .setWrapText(true)
      .setButton(CardService.newTextButton()
        .setText('Back')
        .setTextButtonStyle(CardService.TextButtonStyle.BORDERLESS)
        .setOnClickAction(action_('backToTemplate', { id: id }))))
    .addWidget(CardService.newTextParagraph().setText('<font color="' + GREY + '">Every publish is kept. Restore puts an earlier version back and publishes it for everyone as a new version. Nothing is deleted, so you can always restore again.</font>')));
  var section = CardService.newCardSection();
  var list = data.versions || [];
  if (!list.length) section.addWidget(CardService.newTextParagraph().setText('Not published yet. Versions appear here after you publish.'));
  list.forEach(function (v) {
    var live = v.version === data.current;
    var row = CardService.newDecoratedText()
      .setTopLabel(live ? 'LIVE NOW' : '')
      .setText('v' + v.version + (v.restoredFrom ? ' · restored from v' + v.restoredFrom : ''))
      .setBottomLabel(formatDate_(v.publishedAt) + ' · ' + esc_(String(v.publishedBy || '').split('@')[0]))
      .setWrapText(true);
    if (!live) row.setButton(button_('Restore', 'confirmRestore', { id: id, version: v.version, name: name || '' }));
    section.addWidget(row);
  });
  card.addSection(section);
  return card.build();
}

function confirmRestore(e) {
  init_(e);
  var id = param_(e, 'id');
  var v = param_(e, 'version');
  var card = CardService.newCardBuilder().setName('confirmRestore')
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newDecoratedText().setTopLabel('RESTORE').setText('v' + esc_(v) + ' of ' + esc_(param_(e, 'name'))).setWrapText(true))
      .addWidget(CardService.newTextParagraph().setText('Everyone will get v' + esc_(v) + ' again, published as a new version. Unpublished edits on this template are replaced.'))
      .addWidget(CardService.newButtonSet()
        .addButton(button_('Cancel', 'cancelDelete', {}))
        .addButton(button_('Yes, restore v' + v, 'restoreVersion', { id: id, version: v }, 'filled'))))
    .build();
  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().pushCard(card)).build();
}

function restoreVersion(e) {
  init_(e);
  var id = param_(e, 'id');
  try {
    var out = api_('post', '/api/templates/' + encodeURIComponent(id) + '/restore', { version: Number(param_(e, 'version')) });
    var t = api_('get', '/api/templates/' + encodeURIComponent(id));
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().popToRoot().pushCard(buildEditorCard_(t)))
      .setNotification(CardService.newNotification().setText('Restored v' + out.restoredFrom + ' as v' + out.version + '. Everyone has it now.'))
      .build();
  } catch (err) { return notify_(err.message); }
}

function backToTemplate(e) {
  init_(e);
  try {
    var t = api_('get', '/api/templates/' + encodeURIComponent(param_(e, 'id')));
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().popCard().updateCard(buildEditorCard_(t)))
      .build();
  } catch (err) { return notify_(err.message); }
}

/* ---------- delete (asks first) ---------- */

function confirmDelete(e) {
  init_(e);
  var id = param_(e, 'id');
  var name = param_(e, 'name') || 'this template';
  var card = CardService.newCardBuilder().setName('confirmDelete')
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newDecoratedText().setTopLabel('DELETE TEMPLATE').setText(esc_(name)).setWrapText(true))
      .addWidget(CardService.newTextParagraph().setText('This removes the template for everyone, including its drafts and old versions. It cannot be undone.<br><br><font color="' + GREY + '">To only hide it from users, go back and click Unpublish instead.</font>'))
      .addWidget(CardService.newButtonSet()
        .addButton(button_('Cancel', 'cancelDelete', {}))
        .addButton(CardService.newTextButton()
          .setText('Yes, delete')
          .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
          .setBackgroundColor('#C5221F')
          .setOnClickAction(action_('deleteTemplate', { id: id })))))
    .build();
  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().pushCard(card)).build();
}

function cancelDelete(e) {
  init_(e);
  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().popCard()).build();
}

function deleteTemplate(e) {
  init_(e);
  try {
    var result = api_('post', '/api/templates/' + encodeURIComponent(param_(e, 'id')) + '/delete', {});
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().popToRoot().updateCard(buildGalleryCard_({})))
      .setNotification(CardService.newNotification().setText('Deleted "' + (result.name || 'template') + '".'))
      .build();
  } catch (err) { return notify_(err.message); }
}

/* =========================================================
 * Categories (admins): switch each one on or off for users, add new ones
 * ========================================================= */

function showCategories(e) {
  init_(e);
  try {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(buildCategoriesCard_(api_('get', '/api/categories').categories)))
      .build();
  } catch (err) { return notify_(err.message); }
}

/** One switch flipped: saves only that category, so the others never change. */
function toggleCategory(e) {
  init_(e);
  var name = param_(e, 'name');
  var on = input_(e, param_(e, 'field')) === 'on';
  try {
    api_('post', '/api/categories', { set: { name: name, visible: on } });
    return categoriesResponse_(name + (on ? ' is now visible to users.' : ' is now hidden from users.'));
  } catch (err) { return categoriesResponse_(err.message); }
}

function addCategory(e) {
  init_(e);
  var add = input_(e, 'newCategory');
  if (!add) return notify_('Type a name for the new category first.');
  try {
    api_('post', '/api/categories', { add: add });
    return categoriesResponse_('Added "' + add + '". Users can see it.');
  } catch (err) { return notify_(err.message); }
}

function renameCategory(e) {
  init_(e);
  var from = input_(e, 'catPick');
  var to = input_(e, 'catNewName');
  if (!from || !to) return notify_('Choose a category and type its new name.');
  try {
    api_('post', '/api/categories', { rename: { from: from, to: to } });
    return categoriesResponse_('Renamed "' + from + '" to "' + to + '". Its templates moved with it.');
  } catch (err) { return notify_(err.message); }
}

function deleteCategory(e) {
  init_(e);
  var name = input_(e, 'catPick');
  var moveTo = input_(e, 'catMoveTo');
  if (!name) return notify_('Choose a category to delete.');
  try {
    api_('post', '/api/categories', { remove: { name: name, moveTo: moveTo } });
    return categoriesResponse_('Deleted "' + name + '".' + (moveTo ? ' Its templates moved to "' + moveTo + '".' : ''));
  } catch (err) { return notify_(err.message); }
}

function categoriesResponse_(message) {
  var list = api_('get', '/api/categories').categories;
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildCategoriesCard_(list)))
    .setNotification(CardService.newNotification().setText(message))
    .build();
}

function buildCategoriesCard_(list) {
  list = list || [];
  var card = CardService.newCardBuilder().setName('categories');

  card.addSection(CardService.newCardSection()
    .addWidget(CardService.newDecoratedText()
      .setTopLabel('ADMIN')
      .setText('Categories')
      .setWrapText(true)
      .setButton(CardService.newTextButton()
        .setText('Back to gallery')
        .setTextButtonStyle(CardService.TextButtonStyle.BORDERLESS)
        .setOnClickAction(action_('goHome', {}))))
    .addWidget(CardService.newTextParagraph().setText('<font color="' + GREY + '">Switch a category on or off for users. Each switch saves straight away. Hidden categories stay visible to admins.</font>')));

  var section = CardService.newCardSection();
  list.forEach(function (c, i) {
    var field = 'cat_' + i;
    section.addWidget(CardService.newDecoratedText()
      .setText(esc_(c.name))
      .setBottomLabel((c.count || 0) + (c.count === 1 ? ' template' : ' templates') + ' · ' + (c.visible ? 'Users can see it' : 'Hidden from users'))
      .setWrapText(true)
      .setSwitchControl(CardService.newSwitch()
        .setFieldName(field)
        .setValue('on')
        .setSelected(Boolean(c.visible))
        .setOnChangeAction(action_('toggleCategory', { name: c.name, field: field }))));
  });
  card.addSection(section);

  card.addSection(CardService.newCardSection()
    .setHeader('<b>Add a category</b>')
    .addWidget(CardService.newTextInput()
      .setFieldName('newCategory')
      .setTitle('New category name'))
    .addWidget(CardService.newButtonSet()
      .addButton(button_('Add category', 'addCategory', {}, 'filled'))));

  if (list.length) {
    var pick = CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.DROPDOWN)
      .setFieldName('catPick')
      .setTitle('Category');
    var moveTo = CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.DROPDOWN)
      .setFieldName('catMoveTo')
      .setTitle('When deleting, move its templates to');
    list.forEach(function (c, i) {
      pick.addItem(c.name + ' (' + (c.count || 0) + ')', c.name, i === 0);
      moveTo.addItem(c.name, c.name, i === (list.length > 1 ? 1 : 0));
    });
    card.addSection(CardService.newCardSection()
      .setHeader('<b>Rename or delete</b>')
      .addWidget(pick)
      .addWidget(CardService.newTextInput()
        .setFieldName('catNewName')
        .setTitle('New name (for Rename)'))
      .addWidget(CardService.newButtonSet()
        .addButton(button_('Rename', 'renameCategory', {})))
      .addWidget(moveTo)
      .addWidget(CardService.newButtonSet()
        .addButton(button_('Delete category', 'deleteCategory', {})))
      .addWidget(CardService.newTextParagraph().setText('<font color="' + GREY + '">Renaming keeps every template in it. Deleting moves its templates to the category you choose; an empty category is simply removed.</font>')));
  }
  return card.build();
}

/* =========================================================
 * Images (admins)
 * ========================================================= */

function openUpload(e) {
  init_(e);
  try {
    var ticket = api_('post', '/api/upload-ticket', {});
    return CardService.newActionResponseBuilder()
      .setOpenLink(CardService.newOpenLink()
        .setUrl(ticket.url)
        .setOpenAs(CardService.OpenAs.OVERLAY)
        .setOnClose(CardService.OnClose.NOTHING))
      .build();
  } catch (err) { return notify_(err.message); }
}

function showImages(e) {
  init_(e);
  try {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(buildImagesCard_('')))
      .build();
  } catch (err) { return notify_(err.message); }
}

function filterImages(e) {
  init_(e);
  try { return updateCard_(buildImagesCard_(input_(e, 'imageQuery'))); } catch (err) { return notify_(err.message); }
}

function confirmRemoveImage(e) {
  init_(e);
  var card = CardService.newCardBuilder().setName('confirmRemoveImage')
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newImage().setImageUrl(param_(e, 'url')).setAltText(param_(e, 'name')))
      .addWidget(CardService.newDecoratedText().setTopLabel('REMOVE FROM LIBRARY').setText(esc_(param_(e, 'name'))).setWrapText(true))
      .addWidget(CardService.newTextParagraph().setText('The image disappears from the library list. Templates that use it can\'t lose it: removing is blocked until they stop using it. Emails already sent keep showing it.'))
      .addWidget(CardService.newButtonSet()
        .addButton(button_('Cancel', 'cancelDelete', {}))
        .addButton(CardService.newTextButton()
          .setText('Yes, remove')
          .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
          .setBackgroundColor('#C5221F')
          .setOnClickAction(action_('removeImage', { id: param_(e, 'id') })))))
    .build();
  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().pushCard(card)).build();
}

function removeImage(e) {
  init_(e);
  try {
    var out = api_('post', '/api/images/remove', { id: param_(e, 'id') });
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().popCard().updateCard(buildImagesCard_('')))
      .setNotification(CardService.newNotification().setText('Removed "' + out.name + '" from the library.'))
      .build();
  } catch (err) { return notify_(err.message); }
}

function buildImagesCard_(query) {
  var data = api_('get', '/api/images?q=' + encodeURIComponent(query || ''));
  var card = CardService.newCardBuilder().setName('images');

  card.addSection(CardService.newCardSection()
    .addWidget(CardService.newButtonSet()
      .addButton(button_('Upload image', 'openUpload', {}, 'filled'))
      .addButton(button_('Back to gallery', 'goHome', {})))
    .addWidget(CardService.newTextInput()
      .setFieldName('imageQuery')
      .setTitle('Search images')
      .setValue(query || '')
      .setOnChangeAction(action_('filterImages'))));

  var list = (data.images || []).slice(0, 30);
  var section = CardService.newCardSection().setHeader('<font color="' + BLUE_DARK + '"><b>IMAGES</b></font> · ' + list.length);
  if (!list.length) section.addWidget(CardService.newTextParagraph().setText('No images yet. Click Upload image to add one.'));
  list.forEach(function (img, i) {
    section.addWidget(CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage().setIconUrl(img.url).setAltText(img.name))
      .setText(esc_(img.name))
      .setBottomLabel(Math.max(1, Math.round((img.size || 0) / 1024)) + ' KB · ' + formatDate_(img.uploadedAt))
      .setWrapText(true)
      .setButton(CardService.newTextButton()
        .setText('Remove')
        .setTextButtonStyle(CardService.TextButtonStyle.BORDERLESS)
        .setOnClickAction(action_('confirmRemoveImage', { id: img.id, name: img.name, url: img.url }))));
    section.addWidget(CardService.newTextInput()
      .setFieldName('imgLink' + i)
      .setTitle('Link (select all and copy)')
      .setValue(img.url));
  });
  card.addSection(section);
  return card.build();
}

/* =========================================================
 * Shared pieces
 * ========================================================= */

/** Small grey line under a template's buttons. */
function tip_() {
  return CardService.newTextParagraph()
    .setText('<font color="' + GREY + '">To change the photo or text, click Customise first.</font>');
}

function api_(method, path, body) {
  var options = {
    method: method,
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
  };
  if (AS_USER) options.headers['X-View-As'] = 'user';
  if (body !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(body);
  }
  var res = UrlFetchApp.fetch(API_BASE + path, options);
  var code = res.getResponseCode();
  var data = {};
  try { data = JSON.parse(res.getContentText()); } catch (ignore) { data = {}; }
  if (code >= 400) {
    var err = new Error(data.error || ('Something went wrong (error ' + code + '). Try again.'));
    err.code = code;
    err.data = data;
    throw err;
  }
  return data;
}

function action_(fn, params) {
  var all = { side: SIDE ? '1' : '', asUser: AS_USER ? '1' : '' };
  Object.keys(params || {}).forEach(function (k) { all[k] = String(params[k]); });
  return CardService.newAction().setFunctionName(fn).setParameters(all);
}

/** style: undefined/'outlined' (white with border) or 'filled' (brand colour). */
function button_(text, fn, params, style) {
  var b = CardService.newTextButton().setText(text).setOnClickAction(action_(fn, params));
  if (style === 'filled') {
    b.setTextButtonStyle(CardService.TextButtonStyle.FILLED).setBackgroundColor(BLUE);
  } else {
    try { b.setTextButtonStyle(CardService.TextButtonStyle.OUTLINED); } catch (e) { /* older runtime: default style */ }
  }
  return b;
}

/** Every value of a field that can have several, such as the category switches. */
function inputs_(e, key) {
  var f = e && e.commonEventObject && e.commonEventObject.formInputs;
  if (f && f[key] && f[key].stringInputs && f[key].stringInputs.value) return f[key].stringInputs.value;
  if (e && e.formInputs && e.formInputs[key]) return e.formInputs[key];
  return [];
}

function input_(e, key) {
  var f = e && e.commonEventObject && e.commonEventObject.formInputs;
  if (f && f[key] && f[key].stringInputs && f[key].stringInputs.value) return f[key].stringInputs.value[0] || '';
  if (e && e.formInput && e.formInput[key] !== undefined) return e.formInput[key] || '';
  return '';
}

function param_(e, key) {
  var a = (e && e.commonEventObject && e.commonEventObject.parameters) || {};
  var b = (e && e.parameters) || {};
  return a[key] || b[key] || '';
}

function notify_(text) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(String(text || 'Something went wrong.').slice(0, 200)))
    .build();
}

function updateCard_(card) {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(card))
    .build();
}

function errorCard_(err) {
  return CardService.newCardBuilder()
    .setName('error')
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph().setText('The Template Gallery could not be loaded.<br><br><font color="#5F6368">' + esc_(err.message) + '</font>'))
      .addWidget(button_('Try again', 'goHome', {}, 'filled')))
    .build();
}

function statusLabel_(t) {
  if (t.status === 'published') return t.hasUnpublishedChanges ? 'PUBLISHED · CHANGES NOT LIVE' : 'PUBLISHED';
  if (t.status === 'unpublished') return 'UNPUBLISHED';
  return 'DRAFT';
}

function formatDate_(iso) {
  if (!iso) return '—';
  try { return Utilities.formatDate(new Date(iso), Session.getScriptTimeZone(), 'd MMM yyyy'); } catch (e) { return '—'; }
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
