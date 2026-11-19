/**
 * Custom Email Template Builder — Gmail add-on ("Template Gallery").
 *
 * Opens in two places:
 *   1. The right side panel of Gmail (click the add-on icon on the right edge).
 *      Full height. "Add to email" opens a new email with the template in it.
 *   2. The small box inside the Compose window (the add-on icon at the bottom).
 *      "Add to email" puts the template into the email you are writing.
 *
 * Everyone:  category chips, thumbnails, Add to email, Preview, Customise
 *            (change the photos and text the admin allowed), and
 *            "Shared with you" for templates an admin shared with them by name.
 * Admins:    New template, Upload image, Images, Categories, View as user,
 *            search, and per template: Open editor, Preview, Publish for everyone,
 *            Share with specific people, Gmail check, Make a copy, Versions,
 *            Unpublish and Delete.
 *
 * Gmail decides the panel's font and size; the add-on only uses Gmail's own
 * building blocks (buttons, icons, chips, lists, switches).
 *
 * Built by Legends (@nexoradev-stack), with Claude (Anthropic) and Cursor.
 */

/* ================= Settings: change these for your company ================= */

/** Your engine's Cloud Run address (no slash at the end). Also put it in appsscript.json. */
var API_BASE = 'https://YOUR-ENGINE-URL.a.run.app';
/** The name people see in the panel. */
var APP_NAME = 'Template Gallery';
/** Your brand colour for filled buttons. */
var BLUE = '#6C3BFF';

/* ========================================================================== */
var ASSETS = API_BASE + '/assets/';
var LINK = '#0B57D0';
var GREY = '#5F6368';
var GREEN = '#137333';
var ORANGE = '#B06000';
var RED = '#C5221F';
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
 * Gallery (everyone; admins get their own view)
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
      .addWidget(withStartIcon_(CardService.newDecoratedText()
        .setTopLabel('<font color="#8A5A00"><b>ADMIN</b></font>')
        .setText('Viewing as a user')
        .setWrapText(true)
        .setButton(button_('Back to admin', 'backToAdmin', {})), 'person')));
  }

  if (data.custom) card.addSection(readySection_(data.custom));

  if (admin) return buildAdminGallery_(card, state, items, categories);

  /* Users: templates shared with them by name come first. */
  var mine = data.sharedWithMe || [];
  if (mine.length && !state.category) {
    var shared = CardService.newCardSection().setHeader('<font color="' + LINK + '"><b>SHARED WITH YOU</b></font>');
    mine.forEach(function (t) { addUserCard_(shared, t, 'From ' + firstName_(t.sharedBy) + ' · just for you'); });
    card.addSection(shared);
  }

  /* Nothing given to this person yet (no categories, nothing shared). */
  if (!categories.length && !mine.length && !items.length && !state.q) {
    card.addSection(CardService.newCardSection()
      .addWidget(withStartIcon_(CardService.newDecoratedText()
        .setText('<b>No templates for you yet</b>')
        .setBottomLabel('Ask an admin to add you to a team.')
        .setWrapText(true), 'person', GREY)));
    return card.build();
  }

  if (categories.length) {
    card.addSection(CardService.newCardSection().addWidget(categoryChips_(categories, state.category || '', '', false)));
  }

  if (!items.length) {
    card.addSection(CardService.newCardSection().addWidget(CardService.newTextParagraph().setText(
      state.category ? 'No templates in this category yet.' : 'No templates yet.')));
  }
  var shown = items.slice(0, MAX_LIST);
  groupByCategory_(shown).forEach(function (g) {
    var section = CardService.newCardSection().setHeader(esc_(g.category.toUpperCase()));
    g.items.forEach(function (t) { addUserCard_(section, t, 'Updated ' + formatDate_(t.updatedAt)); });
    card.addSection(section);
  });
  if (items.length > shown.length) {
    card.addSection(CardService.newCardSection().addWidget(CardService.newTextParagraph()
      .setText('<font color="' + GREY + '">Showing ' + shown.length + ' of ' + items.length + '. Pick a category to find the rest.</font>')));
  }
  return card.build();
}

/** One template for users: picture, name, then Add to email, Preview and Customise. */
function addUserCard_(section, t, note) {
  section.addWidget(CardService.newImage()
    .setImageUrl(t.thumbUrl)
    .setAltText('Preview of ' + t.name)
    .setOnClickAction(action_('openPreview', { id: t.id })));
  section.addWidget(CardService.newDecoratedText()
    .setText(esc_(t.name))
    .setBottomLabel(esc_(note || ''))
    .setWrapText(true));
  section.addWidget(CardService.newButtonSet()
    .addButton(addButton_(t.id, 'filled'))
    .addButton(withIcon_(button_('Preview', 'openPreview', { id: t.id }), 'visibility'))
    .addButton(withIcon_(button_('Customise', 'openCustomise', { id: t.id, name: t.name }), 'tune')));
  section.addWidget(CardService.newDivider());
}

function buildAdminGallery_(card, state, items, categories) {
  card.addSection(CardService.newCardSection()
    .addWidget(CardService.newButtonSet()
      .addButton(withIcon_(button_('New template', 'openEditor', {}, 'filled'), 'add'))
      .addButton(withIcon_(button_('Upload image', 'openUpload', {}), 'upload')))
    .addWidget(CardService.newButtonSet()
      .addButton(withIcon_(button_('Images', 'showImages', {}, 'borderless'), 'image'))
      .addButton(withIcon_(button_('Categories', 'showCategories', {}, 'borderless'), 'category'))
      .addButton(withIcon_(button_('Teams', 'showTeams', {}, 'borderless'), 'group'))
      .addButton(withIcon_(button_('View as user', 'viewAsUser', {}, 'borderless'), 'person')))
    .addWidget(CardService.newTextInput()
      .setFieldName('q')
      .setTitle('Search, including drafts')
      .setValue(state.q || '')
      .setOnChangeAction(action_('onSearch', { category: state.category || '' })))
    .addWidget(categoryChips_(categories, state.category || '', state.q || '', true)));

  if (!items.length) {
    card.addSection(CardService.newCardSection().addWidget(CardService.newTextParagraph().setText(
      state.category === 'hidden' ? 'No hidden templates.' : state.q || state.category ? 'No templates found here.' : 'No templates yet. Click New template to add one.')));
    return card.build();
  }
  var shown = items.slice(0, MAX_LIST);
  var section = CardService.newCardSection();
  if (state.category === 'hidden') {
    section.addWidget(CardService.newTextParagraph().setText('<font color="' + GREY + '">' + items.length + (items.length === 1 ? ' hidden template' : ' hidden templates') + '. Only admins see these.</font>'));
  }
  shown.forEach(function (t) {
    section.addWidget(CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage().setIconUrl(t.thumbUrl).setAltText(t.name))
      .setText(esc_(t.name))
      .setBottomLabel(statusLine_(t, true))
      .setWrapText(true)
      .setOnClickAction(action_('showEditor', { id: t.id })));
    section.addWidget(CardService.newButtonSet()
      .addButton(withIcon_(button_('Open editor', 'showEditor', { id: t.id }, 'filled'), 'edit')));
    section.addWidget(CardService.newDivider());
  });
  card.addSection(section);
  if (items.length > shown.length) {
    card.addSection(CardService.newCardSection().addWidget(CardService.newTextParagraph()
      .setText('<font color="' + GREY + '">Showing ' + shown.length + ' of ' + items.length + '. Search or pick a category to find the rest.</font>')));
  }
  return card.build();
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
  forgetGallery_();
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().popToRoot().updateCard(buildGalleryCard_({})))
    .build();
}

/* ---------- category chips (one tap to filter) ---------- */

function categoryChips_(categories, selected, q, admin) {
  var sel = String(selected || '').toLowerCase();
  var entries = [];
  if (!admin && categories.length === 1) {
    /* Only one category for this person: just that one, already picked. */
    entries.push({ id: 'c:', label: categories[0].name, on: true });
  } else {
    entries.push({ id: 'c:', label: 'All', on: !sel });
    categories.forEach(function (c) { entries.push({ id: 'c:' + c.name, label: c.name, on: c.name.toLowerCase() === sel }); });
  }
  if (admin) {
    entries.push({ id: 'c:shared', label: 'Shared', on: sel === 'shared' });
    entries.push({ id: 'c:drafts', label: 'Drafts', on: sel === 'drafts' });
    entries.push({ id: 'c:hidden', label: 'Hidden', on: sel === 'hidden' });
  }
  try {
    var chips = CardService.newChipList();
    try { chips.setLayout(CardService.ChipListLayout.WRAPPED); } catch (ignore) { /* default layout */ }
    entries.forEach(function (c) {
      chips.addChip(CardService.newChip()
        .setLabel((c.on ? '✓ ' : '') + c.label)
        .setOnClickAction(action_('onCategory', { pick: c.id, q: q })));
    });
    return chips;
  } catch (chipErr) {
    /* Chips not available here: plain buttons instead (the picked one is blue). */
    var set = CardService.newButtonSet();
    entries.forEach(function (c) {
      set.addButton(button_((c.on ? '✓ ' : '') + c.label, 'onCategory', { pick: c.id, q: q }, c.on ? 'filled' : 'outlined'));
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
function addButton_(id, style, text) {
  var label = text || 'Add to email';
  if (!SIDE) return withIcon_(button_(label, 'addToEmail', { id: id }, style), 'add');
  var b = CardService.newTextButton()
    .setText(label)
    .setComposeAction(action_('addToNewEmail', { id: id }), CardService.ComposedEmailType.STANDALONE_DRAFT);
  styleButton_(b, style);
  return withIcon_(b, 'add');
}

/* ---------- Customise: the user's own copy of a template ---------- */

/** Opens the Customise window in a tab and shows the steps in the panel. */
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
    .addSection(backSection_('Back to gallery', 'goHome', {}))
    .addSection(CardService.newCardSection()
      .setHeader('CUSTOMISING')
      .addWidget(CardService.newDecoratedText().setText(esc_(name || 'Your template')).setWrapText(true))
      .addWidget(CardService.newTextParagraph().setText(
        '<b>1</b>&nbsp; Change photos and text in the new tab<br>' +
        '<b>2</b>&nbsp; Click <b>Use in my email</b> there<br>' +
        '<b>3</b>&nbsp; Come back and click <b>Add to email</b>'))
      .addWidget(CardService.newButtonSet()
        .addButton(customAddButton_())
        .addButton(withIcon_(button_('Open again', 'openCustomise', { id: id, name: name || '' }), 'open_in_new'))))
    .build();
}

/** "Add to email" for the user's customised copy: new email in the side panel, insert in the Compose box. */
function customAddButton_() {
  if (!SIDE) return withIcon_(button_('Add to email', 'addCustomToEmail', {}, 'filled'), 'add');
  var b = CardService.newTextButton()
    .setText('Add to email')
    .setComposeAction(action_('addCustomToNewEmail', {}), CardService.ComposedEmailType.STANDALONE_DRAFT);
  styleButton_(b, 'filled');
  return withIcon_(b, 'add');
}

/** "Your customised email is ready" box at the top of the gallery. */
function readySection_(custom) {
  var changes = custom.changes || 0;
  return CardService.newCardSection()
    .addWidget(withStartIcon_(CardService.newDecoratedText()
      .setTopLabel('<font color="' + GREEN + '"><b>YOUR CUSTOMISED EMAIL IS READY</b></font>')
      .setText(esc_(custom.name))
      .setBottomLabel(changes === 1 ? '1 part changed' : changes + ' parts changed')
      .setWrapText(true), 'check_circle', GREEN))
    .addWidget(CardService.newButtonSet()
      .addButton(customAddButton_())
      .addButton(button_('Discard', 'discardCustom', {}, 'borderless')));
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
 * Template page (admins)
 * ========================================================= */

/** Opens the full-size editor in a tab (build with blocks or paste HTML). */
function openEditor(e) {
  init_(e);
  try {
    var id = param_(e, 'id');
    var ticket = api_('post', '/api/editor-ticket', { id: id || undefined });
    var res = CardService.newActionResponseBuilder().setOpenLink(tabLink_(ticket.url));
    if (!id) res.setNotification(CardService.newNotification().setText('The editor opened in a new tab.'));
    return res.build();
  } catch (err) { return notify_(err.message); }
}

/** The template's page in the panel. */
function showEditor(e) {
  init_(e);
  try {
    var t = api_('get', '/api/templates/' + encodeURIComponent(param_(e, 'id')) + '?lite=1');
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(buildEditorCard_(t)))
      .build();
  } catch (err) { return notify_(err.message); }
}

function buildEditorCard_(t) {
  var id = t.id || '';
  var params = { id: id };
  var name = t.name || '';
  var published = t.status === 'published';
  var shared = !published && (t.sharedWith || []).length > 0;
  var hidden = Boolean(t.hidden);
  var card = CardService.newCardBuilder().setName('editor');

  if (hidden) {
    card.addSection(CardService.newCardSection().addWidget(withStartIcon_(CardService.newDecoratedText()
      .setText('<b>Hidden</b> · only admins can see it')
      .setWrapText(true), 'visibility_off')));
  }
  card.addSection(backSection_('Back to gallery', 'goHome', {}));

  /* Picture, name, status (click the status line to update it after saving in the editor tab). */
  var top = CardService.newCardSection();
  if (t.thumbUrl) top.addWidget(CardService.newImage().setImageUrl(t.thumbUrl).setAltText('Preview of ' + name).setOnClickAction(action_('previewDraft', params)));
  var head = CardService.newDecoratedText()
    .setTopLabel(esc_(t.category || ''))
    .setText(esc_(name))
    .setBottomLabel(statusLine_(t, false))
    .setWrapText(true)
    .setOnClickAction(action_('refreshEditor', params));
  try { head.setEndIcon(icon_('refresh', GREY)); } catch (ignore) { /* no icon */ }
  top.addWidget(head);
  top.addWidget(CardService.newButtonSet()
    .addButton(withIcon_(button_('Open editor', 'openEditor', params, 'filled'), 'edit'))
    .addButton(withIcon_(button_('Preview', 'previewDraft', params), 'visibility')));
  card.addSection(top);

  /* Hidden: users and the people it is shared with stop seeing it. Admins always see it. */
  card.addSection(CardService.newCardSection().addWidget(withStartIcon_(CardService.newDecoratedText()
    .setText('Hidden')
    .setBottomLabel(hidden ? 'On · switch off to show it again' : 'Off · ' + (published ? 'users who can see ' + esc_(t.category || 'this category') + ' see it' : shared ? 'the people it is shared with can use it' : 'switch on to keep it from users'))
    .setWrapText(true)
    .setSwitchControl(CardService.newSwitch()
      .setFieldName('hiddenSwitch')
      .setValue('on')
      .setSelected(hidden)
      .setOnChangeAction(action_('toggleHidden', params))), 'visibility_off')));

  /* Publish for everyone, and share with named people. */
  var pub = CardService.newCardSection();
  pub.addWidget(CardService.newButtonSet()
    .addButton(withIcon_(button_('Publish for everyone', 'publishTemplate', params, 'filled'), 'check_circle')));
  if (!published) {
    pub.addWidget(CardService.newButtonSet()
      .addButton(withIcon_(button_(shared ? 'Shared with ' + t.sharedWith.length + (t.sharedWith.length === 1 ? ' person' : ' people') : 'Share with specific people', 'showShare', params), 'person_add')));
  }
  pub.addWidget(CardService.newTextParagraph().setText('<font color="' + GREY + '">' + (
    hidden ? (shared ? '<font color="' + ORANGE + '">Sharing is paused while hidden. They can\'t open it.</font> ' : '') + 'Publishing keeps it hidden until you switch Hidden off.'
      : published ? (t.hasUnpublishedChanges ? 'Publishing updates everyone to v' + ((t.version || 0) + 1) + '.' : 'Live for everyone (v' + (t.version || 1) + ').')
      : shared ? (t.sharedStale ? 'You have changes the people it is shared with don\'t have yet. Open Shared to send them the latest.' : 'Only the people it is shared with can use it.')
      : 'Only admins can see it until you publish or share it.') + '</font>'));
  card.addSection(pub);

  if (t.checks && t.checks.length) card.addSection(checksSection_(t.checks));

  /* More options: always shown as a list. */
  var more = CardService.newCardSection().setHeader('MORE OPTIONS');
  if (published) {
    more.addWidget(addToMyEmailRow_(id));
    more.addWidget(optionRow_('Customise for me', 'tune', 'openCustomise', { id: id, name: name }));
  }
  more.addWidget(optionRow_('Make a copy', 'content_copy', 'copyTemplate', params));
  more.addWidget(optionRow_('Versions', 'history', 'showVersions', { id: id, name: name }));
  if (published) more.addWidget(optionRow_('Unpublish (back to draft)', 'visibility_off', 'unpublishTemplate', params));
  more.addWidget(optionRow_('<font color="' + RED + '">Delete template</font>', 'delete', 'confirmDelete', { id: id, name: name }, RED));
  card.addSection(more);

  return card.build();
}

/** "● Published · v3" in colour: green live, orange changes not live, blue shared, grey draft. */
function statusLine_(t, short) {
  var n = (t.sharedWith || []).length;
  if (t.hidden) {
    var what = t.status === 'published' ? 'Published · v' + (t.version || 1) : n ? 'Shared' : t.status === 'unpublished' ? 'Unpublished' : 'Draft';
    return '<font color="' + GREY + '">● ' + what + ' · hidden</font>';
  }
  if (t.status === 'published') {
    return t.hasUnpublishedChanges
      ? '<font color="' + ORANGE + '">● Published · v' + (t.version || 1) + (short ? ' · not live' : ' · you have changes that aren\'t live yet') + '</font>'
      : '<font color="' + GREEN + '">● Published · v' + (t.version || 1) + '</font>';
  }
  if (n) {
    var who = n === 1 ? firstName_(t.sharedWith[0]) : n + ' people';
    return '<font color="' + LINK + '">● Shared with ' + esc_(who) + (t.sharedStale ? ' · changes not shared yet' : short ? '' : ' · not in the gallery for others') + '</font>';
  }
  if (t.status === 'unpublished') return '<font color="' + GREY + '">● Unpublished · hidden from users</font>';
  return '<font color="' + GREY + '">● Draft · only admins see it</font>';
}

/** Gmail check: one line that opens with the arrow. Opens by itself when something must be fixed. */
function checksSection_(checks) {
  var errors = checks.filter(function (c) { return c.level === 'error'; }).length;
  var warns = checks.filter(function (c) { return c.level === 'warn'; }).length;
  var summary = errors
    ? '<font color="' + RED + '">' + errors + ' must fix</font>' + (warns ? ' · <font color="' + ORANGE + '">' + warns + ' to review</font>' : '')
    : warns ? '<font color="' + ORANGE + '">' + warns + ' to review</font>' : '<font color="' + GREEN + '">all good</font>';
  var section = CardService.newCardSection();
  section.addWidget(withStartIcon_(CardService.newDecoratedText().setText('Gmail check · ' + summary).setWrapText(true),
    errors ? 'error' : warns ? 'warning' : 'check', errors ? RED : warns ? ORANGE : GREEN));
  checks.forEach(function (c) {
    var mark = c.level === 'error' ? '<font color="' + RED + '"><b>Fix:</b></font> '
      : c.level === 'warn' ? '<font color="' + ORANGE + '"><b>Check:</b></font> '
      : c.level === 'info' ? '<font color="' + LINK + '"><b>ⓘ</b></font> '
      : '<font color="' + GREEN + '"><b>✓</b></font> ';
    section.addWidget(CardService.newTextParagraph().setText(mark + esc_(c.message)));
  });
  if (errors) {
    section.addWidget(CardService.newTextParagraph().setText('<font color="' + GREY + '">Fix the red item before publishing. Click <b>Open editor</b> to change it.</font>'));
  } else {
    try { section.setCollapsible(true).setNumUncollapsibleWidgets(1); } catch (ignore) { /* shown open */ }
  }
  return section;
}

/** Rebuilds the template page. ready = the template the last action already sent back (no second call). */
function reloadEditor_(id, message, ready) {
  var t = ready || api_('get', '/api/templates/' + encodeURIComponent(id) + '?lite=1');
  var builder = CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildEditorCard_(t)));
  if (message) builder.setNotification(CardService.newNotification().setText(message));
  return builder.build();
}

function refreshEditor(e) {
  init_(e);
  try { return reloadEditor_(param_(e, 'id'), 'Up to date.'); } catch (err) { return notify_(err.message); }
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
    var pub = api_('post', '/api/templates/' + encodeURIComponent(id) + '/publish', {});
    return reloadEditor_(id, 'Published for everyone', pub.template);
  } catch (err) {
    if (err.code === 422) {
      try { return reloadEditor_(id, err.message); } catch (inner) { /* fall through */ }
    }
    return notify_(err.message);
  }
}

/** The Hidden switch on the template page: saves straight away. */
function toggleHidden(e) {
  init_(e);
  var id = param_(e, 'id');
  var on = input_(e, 'hiddenSwitch') === 'on';
  try {
    var r = api_('post', '/api/templates/' + encodeURIComponent(id) + '/hidden', { hidden: on });
    return reloadEditor_(id, on ? 'Hidden. Only admins can see it now.' : 'Shown again. Everyone who could see it before can see it now.', r.template);
  } catch (err) { return notify_(err.message); }
}

function unpublishTemplate(e) {
  init_(e);
  try {
    var id = param_(e, 'id');
    var un = api_('post', '/api/templates/' + encodeURIComponent(id) + '/unpublish', {});
    return reloadEditor_(id, 'Unpublished. Users no longer see this template.', un.template);
  } catch (err) { return notify_(err.message); }
}

/* ---------- share with specific people ---------- */

function showShare(e) {
  init_(e);
  try {
    var t = api_('get', '/api/templates/' + encodeURIComponent(param_(e, 'id')) + '?lite=1');
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(buildShareCard_(t)))
      .build();
  } catch (err) { return notify_(err.message); }
}

function buildShareCard_(t) {
  var id = t.id;
  var people = t.sharedWith || [];
  var card = CardService.newCardBuilder().setName('share');
  card.addSection(backSection_('Back', 'backToTemplate', { id: id }));
  card.addSection(CardService.newCardSection()
    .setHeader('SHARE WITH SPECIFIC PEOPLE')
    .addWidget(CardService.newDecoratedText().setText(esc_(t.name || '')).setWrapText(true))
    .addWidget(CardService.newTextParagraph().setText('<font color="' + GREY + '">Only these people see it, under <b>Shared with you</b> at the top of their gallery. Everyone else doesn\'t.</font>')));

  var list = CardService.newCardSection().setHeader('SHARED WITH');
  if (!people.length) list.addWidget(CardService.newTextParagraph().setText('<font color="' + GREY + '">Nobody yet. Add someone below.</font>'));
  people.forEach(function (email) {
    list.addWidget(withStartIcon_(CardService.newDecoratedText()
      .setText(esc_(firstName_(email)))
      .setBottomLabel(esc_(email))
      .setButton(button_('Remove', 'shareRemove', { id: id, email: email }, 'borderless')), 'person', BLUE));
  });
  if (people.length && t.sharedStale) {
    list.addWidget(CardService.newTextParagraph().setText('<font color="' + ORANGE + '">You saved changes they don\'t have yet.</font>'));
    list.addWidget(CardService.newButtonSet().addButton(withIcon_(button_('Share the latest version', 'shareAgain', { id: id }, 'filled'), 'refresh')));
  }
  card.addSection(list);

  card.addSection(CardService.newCardSection()
    .setHeader('ADD SOMEONE')
    .addWidget(CardService.newTextInput().setFieldName('shareEmail').setTitle('name@your-company.com'))
    .addWidget(CardService.newButtonSet().addButton(withIcon_(button_('Add', 'shareAdd', { id: id }, 'filled'), 'add')))
    .addWidget(CardService.newTextParagraph().setText('<font color="' + GREY + '">Only your company\'s addresses. It\'s added straight away.</font>')));
  if (people.length) {
    card.addSection(CardService.newCardSection().addWidget(CardService.newButtonSet()
      .addButton(button_('Stop sharing with everyone', 'shareStop', { id: id }, 'borderless'))));
  }
  return card.build();
}

function shareSave_(id, people, message) {
  var out = api_('post', '/api/templates/' + encodeURIComponent(id) + '/share', { people: people });
  var t = out.template || api_('get', '/api/templates/' + encodeURIComponent(id) + '?lite=1');
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildShareCard_(t)))
    .setNotification(CardService.newNotification().setText(typeof message === 'function' ? message(out) : message))
    .build();
}

function shareAdd(e) {
  init_(e);
  var id = param_(e, 'id');
  var email = String(input_(e, 'shareEmail') || '').trim().toLowerCase();
  if (!email) return notify_('Type an email address first.');
  try {
    var t = api_('get', '/api/templates/' + encodeURIComponent(id) + '?lite=1');
    var people = (t.sharedWith || []).slice();
    if (people.indexOf(email) === -1) people.push(email);
    return shareSave_(id, people, 'Shared with ' + firstName_(email) + '. They will see it in their gallery.');
  } catch (err) { return notify_(err.message); }
}

function shareRemove(e) {
  init_(e);
  var id = param_(e, 'id');
  var email = param_(e, 'email');
  try {
    var t = api_('get', '/api/templates/' + encodeURIComponent(id) + '?lite=1');
    var people = (t.sharedWith || []).filter(function (p) { return p !== email; });
    return shareSave_(id, people, 'Removed ' + firstName_(email) + '.');
  } catch (err) { return notify_(err.message); }
}

function shareAgain(e) {
  init_(e);
  var id = param_(e, 'id');
  try {
    var t = api_('get', '/api/templates/' + encodeURIComponent(id) + '?lite=1');
    return shareSave_(id, t.sharedWith || [], 'They now have the latest version.');
  } catch (err) { return notify_(err.message); }
}

function shareStop(e) {
  init_(e);
  try { return shareSave_(param_(e, 'id'), [], 'Stopped sharing. Only admins can see it now.'); } catch (err) { return notify_(err.message); }
}

/* ---------- make a copy ---------- */

function copyTemplate(e) {
  init_(e);
  try {
    var made = api_('post', '/api/templates/' + encodeURIComponent(param_(e, 'id')) + '/copy', {});
    var t = made.template || api_('get', '/api/templates/' + encodeURIComponent(made.id) + '?lite=1');
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
  card.addSection(backSection_('Back', 'backToTemplate', { id: id }));
  card.addSection(CardService.newCardSection()
    .setHeader('VERSIONS')
    .addWidget(CardService.newDecoratedText().setText(esc_(name || 'Template')).setWrapText(true))
    .addWidget(CardService.newTextParagraph().setText('<font color="' + GREY + '">Every publish is kept. Restore publishes an old version again as a new one.</font>')));
  var section = CardService.newCardSection();
  var list = data.versions || [];
  if (!list.length) section.addWidget(CardService.newTextParagraph().setText('Not published yet. Versions appear here after you publish.'));
  list.forEach(function (v) {
    var live = v.version === data.current;
    var row = CardService.newDecoratedText()
      .setText('v' + v.version + (live ? ' <font color="' + GREEN + '">· LIVE NOW</font>' : v.restoredFrom ? ' <font color="' + GREY + '">· restored from v' + v.restoredFrom + '</font>' : ''))
      .setBottomLabel(formatDate_(v.publishedAt) + ' · ' + esc_(String(v.publishedBy || '').split('@')[0]))
      .setWrapText(true);
    if (!live) row.setButton(withIcon_(button_('Restore', 'confirmRestore', { id: id, version: v.version, name: name || '' }), 'history'));
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
      .setHeader('RESTORE')
      .addWidget(CardService.newDecoratedText().setText('v' + esc_(v) + ' of ' + esc_(param_(e, 'name'))).setWrapText(true))
      .addWidget(CardService.newTextParagraph().setText('Everyone will get v' + esc_(v) + ' again, published as a new version. Unpublished edits on this template are replaced.'))
      .addWidget(CardService.newButtonSet()
        .addButton(button_('Cancel', 'cancelDelete', {}))
        .addButton(withIcon_(button_('Yes, restore v' + v, 'restoreVersion', { id: id, version: v }, 'filled'), 'history'))))
    .build();
  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().pushCard(card)).build();
}

function restoreVersion(e) {
  init_(e);
  var id = param_(e, 'id');
  try {
    var out = api_('post', '/api/templates/' + encodeURIComponent(id) + '/restore', { version: Number(param_(e, 'version')) });
    var t = out.template || api_('get', '/api/templates/' + encodeURIComponent(id) + '?lite=1');
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().popToRoot().pushCard(buildEditorCard_(t)))
      .setNotification(CardService.newNotification().setText('Restored v' + out.restoredFrom + ' as v' + out.version + '. Everyone has it now.'))
      .build();
  } catch (err) { return notify_(err.message); }
}

function backToTemplate(e) {
  init_(e);
  try {
    var t = api_('get', '/api/templates/' + encodeURIComponent(param_(e, 'id')) + '?lite=1');
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
      .addWidget(withStartIcon_(CardService.newDecoratedText().setText('<font color="' + RED + '"><b>DELETE TEMPLATE</b></font>'), 'delete', RED))
      .addWidget(CardService.newDecoratedText().setText(esc_(name)).setWrapText(true))
      .addWidget(CardService.newTextParagraph().setText('Removes it for everyone, with its drafts and old versions. This can\'t be undone.<br><br><font color="' + GREY + '">Only want to hide it? Use <b>Unpublish</b> instead.</font>'))
      .addWidget(CardService.newButtonSet()
        .addButton(button_('Cancel', 'cancelDelete', {}))
        .addButton(withIcon_(redButton_('Yes, delete', 'deleteTemplate', { id: id }), 'delete'))))
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
 * Categories (admins)
 * ========================================================= */

function showCategories(e) {
  init_(e);
  try {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(buildCategoriesCard_(api_('get', '/api/categories').categories)))
      .build();
  } catch (err) { return notify_(err.message); }
}

/** Older cards: one switch flipped (kept so an open panel never breaks). */
function toggleCategory(e) {
  init_(e);
  var name = param_(e, 'name');
  var on = input_(e, param_(e, 'field')) === 'on';
  try {
    api_('post', '/api/categories', { set: { name: name, visible: on } });
    return categoriesResponse_(name + (on ? ' is now visible to everyone.' : ' is now admins only.'));
  } catch (err) { return categoriesResponse_(err.message); }
}

function addCategory(e) {
  init_(e);
  var add = input_(e, 'newCategory');
  if (!add) return notify_('Type a name for the new category first.');
  try {
    api_('post', '/api/categories', { add: add });
    return categoriesResponse_('Added "' + add + '". Only admins see it until you choose who can.');
  } catch (err) { return notify_(err.message); }
}

function categoriesResponse_(message, pop) {
  var list = api_('get', '/api/categories').categories;
  var nav = CardService.newNavigation();
  if (pop) nav.popCard();
  return CardService.newActionResponseBuilder()
    .setNavigation(nav.updateCard(buildCategoriesCard_(list)))
    .setNotification(CardService.newNotification().setText(message))
    .build();
}

function buildCategoriesCard_(list) {
  list = list || [];
  var card = CardService.newCardBuilder().setName('categories');
  card.addSection(backSection_('Back to gallery', 'goHome', {}));
  card.addSection(CardService.newCardSection()
    .setHeader('CATEGORIES · ' + list.length)
    .addWidget(CardService.newTextParagraph().setText('<font color="' + GREY + '">Each category shows only to the teams and people you choose. Admins always see everything. Open a category to choose who can see it.</font>')));

  var section = CardService.newCardSection();
  list.forEach(function (c) {
    var count = (c.count || 0) + (c.count === 1 ? ' template' : ' templates');
    var who = c.audience || (c.visible ? 'Everyone' : 'Admins only');
    var whoText = who === 'Admins only' ? '<font color="' + ORANGE + '">Admins only (choose who)</font>' : esc_(who);
    section.addWidget(CardService.newDecoratedText()
      .setText(esc_(c.name))
      .setBottomLabel(count + ' · ' + whoText)
      .setWrapText(true)
      .setOnClickAction(action_('showCategory', { name: c.name }))
      .setButton(button_('Open', 'showCategory', { name: c.name }, 'borderless')));
  });
  card.addSection(section);

  card.addSection(CardService.newCardSection()
    .setHeader('ADD A CATEGORY')
    .addWidget(CardService.newTextInput().setFieldName('newCategory').setTitle('New category name'))
    .addWidget(CardService.newButtonSet().addButton(withIcon_(button_('Add', 'addCategory', {}, 'filled'), 'add')))
    .addWidget(CardService.newTextParagraph().setText('<font color="' + GREY + '">New categories start as <b>Admins only</b> until you choose who can see them.</font>')));
  return card.build();
}

/** One category's own page: who can see it, rename, delete. */
function showCategory(e) {
  init_(e);
  try {
    var data = api_('get', '/api/categories');
    var name = param_(e, 'name');
    var c = (data.categories || []).filter(function (x) { return x.name === name; })[0];
    if (!c) return categoriesResponse_('That category no longer exists.');
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(buildCategoryCard_(c, data.categories, data.teams || [])))
      .build();
  } catch (err) { return notify_(err.message); }
}

function buildCategoryCard_(c, list, teams) {
  teams = teams || [];
  var count = c.count || 0;
  var card = CardService.newCardBuilder().setName('category');
  card.addSection(backSection_('Back to categories', 'showCategoriesBack', {}));
  card.addSection(CardService.newCardSection()
    .setHeader('CATEGORY')
    .addWidget(CardService.newDecoratedText()
      .setText('<b>' + esc_(c.name) + '</b>')
      .setBottomLabel(count + (count === 1 ? ' template' : ' templates') + ' · ' + esc_(c.audience || ''))
      .setWrapText(true)));

  /* Who can see it */
  var who = CardService.newCardSection().setHeader('WHO CAN SEE IT');
  var everyone = Boolean(c.visible);
  who.addWidget(CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.RADIO_BUTTON)
    .setFieldName('catMode')
    .addItem('Everyone at your company', 'everyone', everyone)
    .addItem('Only these teams and people', 'only', !everyone)
    .setOnChangeAction(action_('setCategoryMode', { name: c.name })));

  if (!everyone) {
    var byId = {};
    teams.forEach(function (t) { byId[t.id] = t; });
    var chosenTeams = (c.teams || []).filter(function (id) { return byId[id]; });
    var people = c.people || [];
    if (!chosenTeams.length && !people.length) {
      who.addWidget(CardService.newTextParagraph().setText('<font color="' + ORANGE + '">Nobody added yet, so only admins see it.</font>'));
    }
    chosenTeams.forEach(function (id) {
      var t = byId[id];
      who.addWidget(withStartIcon_(CardService.newDecoratedText()
        .setText(esc_(t.name) + ' team')
        .setBottomLabel(t.members.length + (t.members.length === 1 ? ' person' : ' people'))
        .setWrapText(true)
        .setButton(button_('Remove', 'catRemoveTeam', { name: c.name, team: id }, 'borderless')), 'group'));
    });
    people.forEach(function (email) {
      who.addWidget(withStartIcon_(CardService.newDecoratedText()
        .setText(esc_(nameFromEmail_(email)))
        .setBottomLabel(esc_(email))
        .setWrapText(true)
        .setButton(button_('Remove', 'catRemovePerson', { name: c.name, email: email }, 'borderless')), 'person'));
    });

    var free = teams.filter(function (t) { return chosenTeams.indexOf(t.id) < 0; });
    if (free.length) {
      var pick = CardService.newSelectionInput()
        .setType(CardService.SelectionInputType.DROPDOWN)
        .setFieldName('catTeam')
        .setTitle('Add a team');
      free.forEach(function (t, i) { pick.addItem(t.name + ' team (' + t.members.length + ')', t.id, i === 0); });
      who.addWidget(pick);
      who.addWidget(CardService.newButtonSet().addButton(withIcon_(button_('Add team', 'catAddTeam', { name: c.name }), 'group_add')));
    } else if (!teams.length) {
      who.addWidget(CardService.newTextParagraph().setText('<font color="' + GREY + '">No teams yet. Make one with <b>Teams</b> in the gallery, or add people one by one below.</font>'));
    }
    who.addWidget(CardService.newTextInput().setFieldName('catPerson').setTitle('Or add one person (email)').setHint('name@your-company.com'));
    who.addWidget(CardService.newButtonSet().addButton(withIcon_(button_('Add person', 'catAddPerson', { name: c.name }), 'person_add')));

    var seen = [];
    chosenTeams.forEach(function (id) { seen.push(esc_(byId[id].name) + ' team (' + byId[id].members.length + ')'); });
    people.forEach(function (email) { seen.push(esc_(nameFromEmail_(email))); });
    who.addWidget(CardService.newTextParagraph().setText('<font color="' + GREY + '">Seen by: ' + (seen.length ? seen.join(', ') + ', and admins.' : 'admins only.') + '</font>'));
  } else {
    who.addWidget(CardService.newTextParagraph().setText('<font color="' + GREY + '">Seen by everyone at your company.</font>'));
  }
  card.addSection(who);

  card.addSection(CardService.newCardSection()
    .setHeader('RENAME')
    .addWidget(CardService.newTextInput().setFieldName('catNewName').setTitle('Name').setValue(c.name))
    .addWidget(CardService.newButtonSet().addButton(withIcon_(button_('Save name', 'renameCategory', { name: c.name }, 'filled'), 'check')))
    .addWidget(CardService.newTextParagraph().setText('<font color="' + GREY + '">Renaming keeps ' + (count === 1 ? 'its template' : 'all ' + count + ' templates') + ' and who can see it.</font>')));

  var del = CardService.newCardSection();
  del.addWidget(withStartIcon_(CardService.newDecoratedText().setText('<font color="' + RED + '"><b>DELETE CATEGORY</b></font>'), 'delete', RED));
  var others = list.filter(function (x) { return x.name !== c.name; });
  if (count && others.length) {
    var moveTo = CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.DROPDOWN)
      .setFieldName('catMoveTo')
      .setTitle('Move its ' + count + (count === 1 ? ' template' : ' templates') + ' to');
    others.forEach(function (x, i) { moveTo.addItem(x.name, x.name, i === 0); });
    del.addWidget(moveTo);
  }
  if (count && !others.length) {
    del.addWidget(CardService.newTextParagraph().setText('<font color="' + GREY + '">Add another category first, so its templates have somewhere to go.</font>'));
  } else {
    del.addWidget(CardService.newButtonSet().addButton(withIcon_(redButton_('Delete category', 'confirmDeleteCategory', { name: c.name, count: count }), 'delete')));
    del.addWidget(CardService.newTextParagraph().setText('<font color="' + GREY + '">Asks once more before deleting. An empty category is just removed.</font>'));
  }
  card.addSection(del);
  return card.build();
}

/* ---------- who can see a category: changes ---------- */

/** Saves who can see one category and redraws its page. change(c) edits a copy of the category. */
function saveAudience_(name, change, message) {
  var data = api_('get', '/api/categories');
  var c = (data.categories || []).filter(function (x) { return x.name === name; })[0];
  if (!c) return categoriesResponse_('That category no longer exists.', true);
  var next = { name: name, everyone: Boolean(c.visible), teams: (c.teams || []).slice(), people: (c.people || []).slice() };
  change(next);
  var out = api_('post', '/api/categories', { audience: next });
  var fresh = (out.categories || []).filter(function (x) { return x.name === name; })[0];
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildCategoryCard_(fresh, out.categories, out.teams || [])))
    .setNotification(CardService.newNotification().setText(message))
    .build();
}

function setCategoryMode(e) {
  init_(e);
  var name = param_(e, 'name');
  var everyone = input_(e, 'catMode') === 'everyone';
  try {
    return saveAudience_(name, function (a) { a.everyone = everyone; },
      everyone ? name + ' is now seen by everyone.' : name + ' is now seen only by the teams and people you add.');
  } catch (err) { return notify_(err.message); }
}

function catAddTeam(e) {
  init_(e);
  var name = param_(e, 'name');
  var team = input_(e, 'catTeam');
  if (!team) return notify_('Pick a team first.');
  try {
    return saveAudience_(name, function (a) { if (a.teams.indexOf(team) < 0) a.teams.push(team); }, 'Team added. They can see ' + name + ' now.');
  } catch (err) { return notify_(err.message); }
}

function catRemoveTeam(e) {
  init_(e);
  var name = param_(e, 'name');
  var team = param_(e, 'team');
  try {
    return saveAudience_(name, function (a) { a.teams = a.teams.filter(function (x) { return x !== team; }); }, 'Team removed from ' + name + '.');
  } catch (err) { return notify_(err.message); }
}

function catAddPerson(e) {
  init_(e);
  var name = param_(e, 'name');
  var email = String(input_(e, 'catPerson') || '').trim().toLowerCase();
  if (!email) return notify_('Type an email address first.');
  try {
    return saveAudience_(name, function (a) { if (a.people.indexOf(email) < 0) a.people.push(email); }, nameFromEmail_(email) + ' can see ' + name + ' now.');
  } catch (err) { return notify_(err.message); }
}

function catRemovePerson(e) {
  init_(e);
  var name = param_(e, 'name');
  var email = param_(e, 'email');
  try {
    return saveAudience_(name, function (a) { a.people = a.people.filter(function (x) { return x !== email; }); }, nameFromEmail_(email) + ' removed from ' + name + '.');
  } catch (err) { return notify_(err.message); }
}

function showCategoriesBack(e) {
  init_(e);
  try {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().popCard().updateCard(buildCategoriesCard_(api_('get', '/api/categories').categories)))
      .build();
  } catch (err) { return notify_(err.message); }
}

function renameCategory(e) {
  init_(e);
  var from = param_(e, 'name');
  var to = String(input_(e, 'catNewName') || '').trim();
  if (!to) return notify_('Type the new name first.');
  if (to === from) return notify_('That is already its name.');
  try {
    api_('post', '/api/categories', { rename: { from: from, to: to } });
    return categoriesResponse_('Renamed "' + from + '" to "' + to + '". Its templates moved with it.', true);
  } catch (err) { return notify_(err.message); }
}

function confirmDeleteCategory(e) {
  init_(e);
  var name = param_(e, 'name');
  var count = Number(param_(e, 'count')) || 0;
  var moveTo = input_(e, 'catMoveTo');
  var card = CardService.newCardBuilder().setName('confirmDeleteCategory')
    .addSection(CardService.newCardSection()
      .addWidget(withStartIcon_(CardService.newDecoratedText().setText('<font color="' + RED + '"><b>DELETE CATEGORY</b></font>'), 'delete', RED))
      .addWidget(CardService.newDecoratedText().setText(esc_(name)).setWrapText(true))
      .addWidget(CardService.newTextParagraph().setText(count
        ? 'Its ' + count + (count === 1 ? ' template moves' : ' templates move') + ' to <b>' + esc_(moveTo) + '</b>. Nothing else changes.'
        : 'It has no templates, so it is simply removed.'))
      .addWidget(CardService.newButtonSet()
        .addButton(button_('Cancel', 'cancelDelete', {}))
        .addButton(withIcon_(redButton_('Yes, delete', 'deleteCategory', { name: name, moveTo: moveTo }), 'delete'))))
    .build();
  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().pushCard(card)).build();
}

function deleteCategory(e) {
  init_(e);
  var name = param_(e, 'name');
  var moveTo = param_(e, 'moveTo');
  try {
    api_('post', '/api/categories', { remove: { name: name, moveTo: moveTo } });
    var list = api_('get', '/api/categories').categories;
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().popToRoot().pushCard(buildCategoriesCard_(list)))
      .setNotification(CardService.newNotification().setText('Deleted "' + name + '".' + (moveTo ? ' Its templates moved to "' + moveTo + '".' : '')))
      .build();
  } catch (err) { return notify_(err.message); }
}

/* =========================================================
 * Teams (admins): named lists of people, given categories on each category's page
 * ========================================================= */

function showTeams(e) {
  init_(e);
  try {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(buildTeamsCard_(api_('get', '/api/teams').teams)))
      .build();
  } catch (err) { return notify_(err.message); }
}

function buildTeamsCard_(teams) {
  teams = teams || [];
  var card = CardService.newCardBuilder().setName('teams');
  card.addSection(backSection_('Back to gallery', 'goHome', {}));
  card.addSection(CardService.newCardSection()
    .setHeader('TEAMS · ' + teams.length)
    .addWidget(CardService.newTextParagraph().setText('<font color="' + GREY + '">A team is a list of people. Choose which categories each team can see on the category\'s page.</font>')));

  if (teams.length) {
    var list = CardService.newCardSection();
    teams.forEach(function (t) {
      list.addWidget(withStartIcon_(CardService.newDecoratedText()
        .setText(esc_(t.name) + ' team')
        .setBottomLabel(t.members.length + (t.members.length === 1 ? ' person' : ' people') + ' · ' + (t.categories && t.categories.length ? 'sees ' + esc_(t.categories.join(', ')) : 'no categories yet'))
        .setWrapText(true)
        .setOnClickAction(action_('showTeam', { id: t.id }))
        .setButton(button_('Open', 'showTeam', { id: t.id }, 'borderless')), 'group'));
    });
    card.addSection(list);
  }

  card.addSection(CardService.newCardSection()
    .setHeader('NEW TEAM')
    .addWidget(CardService.newTextInput().setFieldName('teamName').setTitle('Team name').setHint('For example: HR, Delivery, Leaders'))
    .addWidget(CardService.newButtonSet().addButton(withIcon_(button_('Create', 'createTeam', {}, 'filled'), 'add'))));
  return card.build();
}

function findTeam_(teams, id) {
  return (teams || []).filter(function (t) { return t.id === id; })[0] || null;
}

function showTeam(e) {
  init_(e);
  try {
    var teams = api_('get', '/api/teams').teams;
    var t = findTeam_(teams, param_(e, 'id'));
    if (!t) return notify_('That team no longer exists.');
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(buildTeamCard_(t)))
      .build();
  } catch (err) { return notify_(err.message); }
}

function buildTeamCard_(t) {
  var params = { id: t.id };
  var n = t.members.length;
  var card = CardService.newCardBuilder().setName('team');
  card.addSection(backSection_('Back to teams', 'showTeamsBack', {}));
  card.addSection(CardService.newCardSection()
    .setHeader('TEAM')
    .addWidget(CardService.newDecoratedText()
      .setText('<b>' + esc_(t.name) + ' team</b>')
      .setBottomLabel(n + (n === 1 ? ' person' : ' people') + ' · ' + (t.categories && t.categories.length ? 'sees ' + esc_(t.categories.join(', ')) : 'no categories yet'))
      .setWrapText(true)));

  var people = CardService.newCardSection().setHeader('PEOPLE · ' + n);
  if (!n) people.addWidget(CardService.newTextParagraph().setText('<font color="' + GREY + '">Nobody in this team yet.</font>'));
  t.members.forEach(function (email) {
    people.addWidget(withStartIcon_(CardService.newDecoratedText()
      .setText(esc_(nameFromEmail_(email)))
      .setBottomLabel(esc_(email))
      .setWrapText(true)
      .setButton(button_('Remove', 'removeTeamPerson', { id: t.id, email: email }, 'borderless')), 'person'));
  });
  people.addWidget(CardService.newTextInput().setFieldName('teamPeople').setTitle('Add people (emails)').setHint('Separate several with commas'));
  people.addWidget(CardService.newButtonSet().addButton(withIcon_(button_('Add', 'addTeamPeople', params, 'filled'), 'person_add')));
  card.addSection(people);

  card.addSection(CardService.newCardSection()
    .setHeader('RENAME')
    .addWidget(CardService.newTextInput().setFieldName('teamNewName').setTitle('Team name').setValue(t.name))
    .addWidget(CardService.newButtonSet().addButton(withIcon_(button_('Save name', 'renameTeam', params), 'check'))));

  card.addSection(CardService.newCardSection()
    .addWidget(CardService.newButtonSet().addButton(withIcon_(redButton_('Delete team', 'confirmDeleteTeam', { id: t.id, name: t.name }), 'delete')))
    .addWidget(CardService.newTextParagraph().setText('<font color="' + GREY + '">Asks once more. Its people lose the categories they got through this team.</font>')));
  return card.build();
}

/** Saves one team change and redraws the team page (or the list). */
function teamChange_(body, id, message) {
  var out = api_('post', '/api/teams', body);
  var t = findTeam_(out.teams, id || out.created);
  var card = t ? buildTeamCard_(t) : buildTeamsCard_(out.teams);
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(card))
    .setNotification(CardService.newNotification().setText(message))
    .build();
}

function createTeam(e) {
  init_(e);
  var name = String(input_(e, 'teamName') || '').trim();
  if (!name) return notify_('Type a team name first.');
  try {
    var out = api_('post', '/api/teams', { create: name });
    var t = findTeam_(out.teams, out.created);
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(buildTeamsCard_(out.teams)).pushCard(buildTeamCard_(t)))
      .setNotification(CardService.newNotification().setText('Made the ' + name + ' team. Now add its people.'))
      .build();
  } catch (err) { return notify_(err.message); }
}

function addTeamPeople(e) {
  init_(e);
  var id = param_(e, 'id');
  var emails = String(input_(e, 'teamPeople') || '').trim();
  if (!emails) return notify_('Type an email address first.');
  try {
    var n = emails.split(/[\s,;]+/).filter(function (x) { return x; }).length;
    return teamChange_({ addMembers: { id: id, emails: emails } }, id, n === 1 ? 'Added ' + nameFromEmail_(emails) + '.' : 'Added ' + n + ' people.');
  } catch (err) { return notify_(err.message); }
}

function removeTeamPerson(e) {
  init_(e);
  var id = param_(e, 'id');
  var email = param_(e, 'email');
  try { return teamChange_({ removeMember: { id: id, email: email } }, id, nameFromEmail_(email) + ' removed from the team.'); } catch (err) { return notify_(err.message); }
}

function renameTeam(e) {
  init_(e);
  var id = param_(e, 'id');
  var name = String(input_(e, 'teamNewName') || '').trim();
  if (!name) return notify_('Type the new name first.');
  try { return teamChange_({ rename: { id: id, name: name } }, id, 'Renamed to ' + name + '.'); } catch (err) { return notify_(err.message); }
}

function confirmDeleteTeam(e) {
  init_(e);
  var id = param_(e, 'id');
  var name = param_(e, 'name');
  var card = CardService.newCardBuilder().setName('confirmDeleteTeam')
    .addSection(CardService.newCardSection()
      .addWidget(withStartIcon_(CardService.newDecoratedText().setText('<font color="' + RED + '"><b>DELETE TEAM</b></font>'), 'delete', RED))
      .addWidget(CardService.newDecoratedText().setText(esc_(name) + ' team').setWrapText(true))
      .addWidget(CardService.newTextParagraph().setText('Its people lose the categories they could see through this team. People added to a category by email keep it.'))
      .addWidget(CardService.newButtonSet()
        .addButton(button_('Cancel', 'cancelDelete', {}))
        .addButton(withIcon_(redButton_('Yes, delete', 'deleteTeam', { id: id, name: name }), 'delete'))))
    .build();
  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().pushCard(card)).build();
}

function deleteTeam(e) {
  init_(e);
  try {
    var out = api_('post', '/api/teams', { remove: { id: param_(e, 'id') } });
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().popToRoot().pushCard(buildTeamsCard_(out.teams)))
      .setNotification(CardService.newNotification().setText('Deleted the ' + param_(e, 'name') + ' team.'))
      .build();
  } catch (err) { return notify_(err.message); }
}

function showTeamsBack(e) {
  init_(e);
  try {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().popCard().updateCard(buildTeamsCard_(api_('get', '/api/teams').teams)))
      .build();
  } catch (err) { return notify_(err.message); }
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

function buildImagesCard_(query) {
  var data = api_('get', '/api/images?q=' + encodeURIComponent(query || ''));
  var list = (data.images || []).slice(0, 30);
  var card = CardService.newCardBuilder().setName('images');
  card.addSection(backSection_('Back to gallery', 'goHome', {}));
  card.addSection(CardService.newCardSection()
    .setHeader('IMAGES · ' + (data.images || []).length)
    .addWidget(CardService.newButtonSet().addButton(withIcon_(button_('Upload image', 'openUpload', {}, 'filled'), 'upload')))
    .addWidget(CardService.newTextInput()
      .setFieldName('imageQuery')
      .setTitle('Search images')
      .setValue(query || '')
      .setOnChangeAction(action_('filterImages'))));

  var section = CardService.newCardSection();
  if (!list.length) section.addWidget(CardService.newTextParagraph().setText(query ? 'No images match.' : 'No images yet. Click Upload image to add one.'));
  list.forEach(function (img) {
    var row = CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage().setIconUrl(img.url).setAltText(img.name))
      .setText(esc_(img.name))
      .setBottomLabel(sizeText_(img.size) + ' · ' + formatDate_(img.uploadedAt) + ' · ' + usedText_(img.usedIn))
      .setWrapText(true)
      .setOnClickAction(action_('showImage', { id: img.id }))
      /* A real button on the right, so clicking the right side opens the image too. */
      .setButton(withIcon_(button_('Open', 'showImage', { id: img.id }, 'borderless'), 'chevron_right'));
    section.addWidget(row);
  });
  card.addSection(section);
  return card.build();
}

function findImage_(id) {
  var all = api_('get', '/api/images').images || [];
  return all.filter(function (x) { return x.id === id; })[0] || null;
}

/** One image's own page: where it is used, its link, open full size, delete. */
function showImage(e) {
  init_(e);
  try {
    var img = findImage_(param_(e, 'id'));
    if (!img) return notify_('That image is no longer in the library.');
    var used = img.usedIn || [];
    var card = CardService.newCardBuilder().setName('image');
    card.addSection(backSection_('Back to images', 'cancelDelete', {}));
    var s = CardService.newCardSection()
      .addWidget(CardService.newImage().setImageUrl(img.url).setAltText(img.name))
      .addWidget(CardService.newDecoratedText()
        .setText(esc_(img.name))
        .setBottomLabel(sizeText_(img.size) + ' · ' + formatDate_(img.uploadedAt) + (img.uploadedBy ? ' · uploaded by ' + esc_(String(img.uploadedBy).split('@')[0]) : ''))
        .setWrapText(true));
    s.addWidget(CardService.newTextParagraph().setText('<font color="' + GREY + '"><b>USED IN</b></font><br>' +
      (used.length ? used.map(function (n) { return '• ' + esc_(n); }).join('<br>') : 'Not used in any template.')));
    s.addWidget(CardService.newTextInput().setFieldName('imgLink').setTitle('Image link (select all and copy)').setValue(img.url));
    s.addWidget(CardService.newButtonSet()
      .addButton(withIcon_(CardService.newTextButton().setText('Open full size').setOpenLink(CardService.newOpenLink().setUrl(img.url).setOpenAs(CardService.OpenAs.FULL_SIZE)), 'open_in_new'))
      .addButton(withIcon_(redButton_('Delete', 'confirmRemoveImage', { id: img.id }), 'delete')));
    card.addSection(s);
    return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().pushCard(card.build())).build();
  } catch (err) { return notify_(err.message); }
}

/** Asks first. Templates that use the image keep it: only the library list loses it. */
function confirmRemoveImage(e) {
  init_(e);
  try {
    var img = findImage_(param_(e, 'id'));
    if (!img) return notify_('That image is no longer in the library.');
    var used = img.usedIn || [];
    var text = used.length
      ? 'It\'s used in ' + listText_(used) + '. Those templates and emails already sent will <b>keep showing it</b>. It just won\'t be in the image list for new templates.'
      : 'It isn\'t used in any template. Emails already sent with it keep showing it.';
    var card = CardService.newCardBuilder().setName('confirmRemoveImage')
      .addSection(CardService.newCardSection()
        .addWidget(CardService.newImage().setImageUrl(img.url).setAltText(img.name))
        .addWidget(withStartIcon_(CardService.newDecoratedText().setText('<font color="' + RED + '"><b>DELETE IMAGE</b></font>'), 'delete', RED))
        .addWidget(CardService.newDecoratedText().setText(esc_(img.name)).setWrapText(true))
        .addWidget(CardService.newTextParagraph().setText(text))
        .addWidget(CardService.newButtonSet()
          .addButton(button_('Cancel', 'cancelDelete', {}))
          .addButton(withIcon_(redButton_('Yes, delete', 'removeImage', { id: img.id }), 'delete'))))
      .build();
    return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().pushCard(card)).build();
  } catch (err) { return notify_(err.message); }
}

function removeImage(e) {
  init_(e);
  try {
    var out = api_('post', '/api/images/remove', { id: param_(e, 'id') });
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().popToRoot().pushCard(buildImagesCard_('')))
      .setNotification(CardService.newNotification().setText('Deleted "' + out.name + '" from the image list.' + ((out.usedIn || []).length ? ' Templates using it keep it.' : '')))
      .build();
  } catch (err) { return notify_(err.message); }
}

/* =========================================================
 * Shared pieces
 * ========================================================= */

/*
 * Talks to the engine.
 * - Waking up: if the engine is starting after a quiet period, a read is tried once more
 *   before any error is shown.
 * - Gallery memory: the template list a user sees is kept for 45 seconds, so opening the
 *   panel again or tapping a category is instant. Any change made through the add-on
 *   (publish, share, delete, ...) clears it at once. Admin views are never kept.
 */
var GALLERY_SECONDS = 45;

function api_(method, path, body, fresh) {
  var memoKey = null;
  if (method === 'get' && path.indexOf('/api/templates?') === 0 && !fresh) {
    memoKey = galleryKey_(path);
    var kept = memoKey && readMemo_(memoKey);
    if (kept) return kept;
  }
  if (method !== 'get') forgetGallery_();
  var data = callEngine_(method, path, body);
  if (memoKey && !data.isAdmin) saveMemo_(memoKey, data);
  return data;
}

function callEngine_(method, path, body) {
  var tries = method === 'get' ? 2 : 1;
  for (var attempt = 1; ; attempt++) {
    try {
      return fetchEngine_(method, path, body);
    } catch (err) {
      var waking = !err.code || err.code >= 500 || err.code === 429;
      if (attempt >= tries || !waking) throw err;
      Utilities.sleep(800);
    }
  }
}

function galleryKey_(path) {
  try {
    var gen = CacheService.getUserCache().get('gallery-gen') || '0';
    return 'g' + gen + (AS_USER ? 'u' : '') + ':' + path.slice(0, 200);
  } catch (e) { return null; }
}

function readMemo_(key) {
  try {
    var raw = CacheService.getUserCache().get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function saveMemo_(key, data) {
  try {
    var raw = JSON.stringify(data);
    if (raw.length < 90000) CacheService.getUserCache().put(key, raw, GALLERY_SECONDS);
  } catch (e) { /* not kept: the next open asks the engine again */ }
}

function forgetGallery_() {
  try { CacheService.getUserCache().put('gallery-gen', String(new Date().getTime()), 21600); } catch (e) { /* ignore */ }
}

function fetchEngine_(method, path, body) {
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

/** style: undefined/'outlined' (white with border), 'filled' (your brand colour) or 'borderless' (blue text). */
function button_(text, fn, params, style) {
  var b = CardService.newTextButton().setText(text).setOnClickAction(action_(fn, params));
  styleButton_(b, style);
  return b;
}

function styleButton_(b, style) {
  if (style === 'filled') {
    b.setTextButtonStyle(CardService.TextButtonStyle.FILLED).setBackgroundColor(BLUE);
  } else if (style === 'borderless') {
    b.setTextButtonStyle(CardService.TextButtonStyle.BORDERLESS);
  } else {
    try { b.setTextButtonStyle(CardService.TextButtonStyle.OUTLINED); } catch (e) { /* older runtime: default style */ }
  }
  return b;
}

/** A red filled button (delete). */
function redButton_(text, fn, params) {
  return CardService.newTextButton().setText(text)
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setBackgroundColor(RED)
    .setOnClickAction(action_(fn, params));
}

/** Google's own icon on a button (skipped quietly where Gmail does not show icons). */
function withIcon_(button, name) {
  try { button.setMaterialIcon(CardService.newMaterialIcon().setName(name)); } catch (e) { /* text only */ }
  return button;
}

/** An icon for a list row. */
function icon_(name, color) {
  var img = CardService.newIconImage();
  img.setMaterialIcon(CardService.newMaterialIcon().setName(name));
  return img;
}

function withStartIcon_(row, name, color) {
  try { row.setStartIcon(icon_(name, color)); } catch (e) { /* no icon */ }
  return row;
}

/** "← Back to gallery" line at the top of a page. */
function backSection_(text, fn, params) {
  return CardService.newCardSection().addWidget(CardService.newButtonSet()
    .addButton(withIcon_(button_(text, fn, params, 'borderless'), 'arrow_back')));
}

/** A row in "More options": icon + words, the whole row is clickable. */
function optionRow_(html, iconName, fn, params, color) {
  return withStartIcon_(CardService.newDecoratedText()
    .setText(html)
    .setOnClickAction(action_(fn, params)), iconName, color);
}

/** "Add to my email" row: a new email in the side panel, insert in the Compose box. */
function addToMyEmailRow_(id) {
  var row = withStartIcon_(CardService.newDecoratedText().setText('Add to my email'), 'add');
  if (SIDE) row.setComposeAction(action_('addToNewEmail', { id: id }), CardService.ComposedEmailType.STANDALONE_DRAFT);
  else row.setOnClickAction(action_('addToEmail', { id: id }));
  return row;
}

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
      .addWidget(CardService.newTextParagraph().setText('The ' + esc_(APP_NAME) + ' could not be loaded.<br><br><font color="#5F6368">' + esc_(err.message) + '</font>'))
      .addWidget(button_('Try again', 'goHome', {}, 'filled')))
    .build();
}

/** "Alex" from alex@your-company.com or alex.lee@your-company.com */
function firstName_(email) {
  var n = String(email || '').split('@')[0].split(/[._-]/)[0] || String(email || 'someone');
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/** "Alex Lee" from alex.lee@your-company.com */
function nameFromEmail_(email) {
  var parts = String(email || '').split('@')[0].split(/[._-]+/).filter(function (p) { return p; });
  if (!parts.length) return String(email || '');
  return parts.map(function (p) { return p.charAt(0).toUpperCase() + p.slice(1); }).join(' ');
}

function listText_(names) {
  var q = names.map(function (n) { return '<b>' + esc_(n) + '</b>'; });
  if (q.length <= 2) return q.join(' and ');
  return q.slice(0, 2).join(', ') + ' and ' + (q.length - 2) + ' more';
}

function usedText_(usedIn) {
  var n = (usedIn || []).length;
  return n ? 'used in ' + n + (n === 1 ? ' template' : ' templates') : 'not used';
}

function sizeText_(bytes) {
  var n = Number(bytes) || 0;
  return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
}

function formatDate_(iso) {
  if (!iso) return '—';
  try { return Utilities.formatDate(new Date(iso), Session.getScriptTimeZone(), 'd MMM yyyy'); } catch (e) { return '—'; }
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
