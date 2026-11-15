<p align="center">
  <img src="docs/images/banner.png" alt="Custom Email Template Builder for Gmail" width="100%">
</p>

<h1 align="center">Custom Email Template Builder – Gmail</h1>

<p align="center">
  <b>Branded HTML email templates for your whole company, right inside Gmail.</b><br>
  Admins design and lock. Everyone else customises and sends.
</p>

<p align="center">
  <img alt="Gmail add-on" src="https://img.shields.io/badge/Gmail-add--on-6C3BFF?style=for-the-badge&logo=gmail&logoColor=white">
  <img alt="Google Cloud Run" src="https://img.shields.io/badge/Cloud%20Run-engine-FF5C7A?style=for-the-badge&logo=googlecloud&logoColor=white">
  <img alt="Node.js 20" src="https://img.shields.io/badge/Node.js-20-19C7A6?style=for-the-badge&logo=nodedotjs&logoColor=white">
  <img alt="Apps Script" src="https://img.shields.io/badge/Apps%20Script-V8-FFB547?style=for-the-badge&logo=google&logoColor=white">
  <img alt="MIT licence" src="https://img.shields.io/badge/licence-MIT-17123B?style=for-the-badge">
</p>

<p align="center">
  <a href="#-what-it-does">What it does</a> ·
  <a href="#-see-it">See it</a> ·
  <a href="#-how-it-works">How it works</a> ·
  <a href="#-quick-start">Quick start</a> ·
  <a href="#-make-it-yours">Make it yours</a> ·
  <a href="#-credits">Credits</a>
</p>

---

## ✨ What it does

Marketing teams design beautiful emails in Figma, Canva or with AI, but getting them into everyone's Gmail usually means a paid marketing tool or copy-paste that breaks the layout. This project is a **Gmail add-on with a small Google Cloud engine** that fixes that:

- 🎨 **Admins build templates** by pasting HTML (from Figma plugins, ChatGPT, Gemini or Claude) or by **building with blocks**, then **lock** the parts that must never change and **publish** to everyone.
- ✍️ **Everyone else** opens the side panel in Gmail, picks a template, **changes only what's allowed** (photos, text) and clicks **Add to email**.
- ✅ **Every template is made Gmail-safe automatically:** CSS is inlined, fonts get safe backups, widths become fluid, and a checklist warns about anything Gmail would break.

### For admins

| | |
|---|---|
| 🧩 **Two ways to build** | **Paste HTML** with *Edit in preview*, or **Build with blocks** (header, image, text, button, image + text, columns, divider, space, footer) |
| 🖱️ **Edit in preview** | Click any text, button, picture or row: fonts (39), sizes 10–72, colours, alignment, links, button styles |
| 🧱 **Rows** | Add, drag, move, copy, delete, set background and spacing; add a **header** or **footer** row in one click |
| 🔒 **Locks** | Lock any part or a whole row; users can't change it when customising |
| 🖼️ **Image library** | Upload, pick, **copy into library** from other sites, cut to shapes (1:1, 4:5, 16:9…), safe remove |
| ↩️ **Undo, redo & versions** | Last 50 changes, `Cmd + Z`; every publish is kept and can be **restored** |
| 👥 **Teamwork** | Make a copy, categories (show/hide, rename, delete), a warning when two admins save the same template |
| ⚡ **Fast publish** | Live in a few seconds; the gallery thumbnail is made in the background |

### For everyone

| | |
|---|---|
| 📚 **Gallery** | Categories and thumbnails in Gmail's side panel and Compose box |
| 👀 **Preview** | Desktop and mobile |
| ✏️ **Customise** | Retype text, swap photos (always fitted to the frame), bold / italic / links, with locked parts protected |
| 📨 **Add to email** | Opens a new email, or fills the one you're writing |

---

## 👀 See it

<table>
  <tr>
    <td width="50%"><img src="docs/images/paste-html-text-tools.png" alt="Paste HTML with the text toolbar"><br><sub><b>Edit in preview:</b> click text for font, size, colour, alignment and links. Row tools sit on the left.</sub></td>
    <td width="50%"><img src="docs/images/paste-html-add-row.png" alt="Add a row menu"><br><sub><b>Add a row:</b> text, image, button, columns, header, footer, or copy a row to keep your exact design.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/images/paste-html-image-tools.png" alt="Image tools"><br><sub><b>Image tools:</b> upload, library, copy into library, heights and alt text.</sub></td>
    <td><img src="docs/images/build-with-blocks.png" alt="Build with blocks"><br><sub><b>Build with blocks:</b> rows, fonts, sizes, colours, spacing and locks, with no code.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/images/customise.png" alt="Customise as a user"><br><sub><b>Customise:</b> users change only what the admin allowed.</sub></td>
    <td><img src="docs/images/preview-mobile.png" alt="Mobile preview"><br><sub><b>Preview:</b> check desktop and mobile before sending.</sub></td>
  </tr>
</table>

---

## 🧠 How it works

```mermaid
flowchart LR
  subgraph GM["📬 Gmail"]
    SP["Side panel & Compose box<br/><i>Apps Script add-on</i>"]
  end

  subgraph CR["☁️ Cloud Run engine · Node 20"]
    API["REST API<br/>auth · roles"]
    ED["Editor pages<br/>Paste HTML · Blocks"]
    CU["Customise &<br/>Preview pages"]
    PL["Email pipeline<br/>inline CSS · fonts · checks"]
    TH["Thumbnails<br/>headless Chromium"]
  end

  FS[("🗂️ Firestore<br/>templates · versions<br/>images · settings")]
  GCS[("🖼️ Cloud Storage<br/>public image library")]
  CI["👥 Cloud Identity<br/>admin Google Group"]

  SP -- "OAuth token" --> API
  SP -. "one-time ticket<br/>opens a tab" .-> ED
  SP -. "one-time ticket" .-> CU
  API --> PL
  ED --> PL
  API --> FS
  ED --> GCS
  API -- "is admin?" --> CI
  API -. "after publish" .-> TH
  TH --> GCS

  classDef gmail fill:#FF5C7A,stroke:#FF5C7A,color:#fff
  classDef engine fill:#6C3BFF,stroke:#6C3BFF,color:#fff
  classDef store fill:#19C7A6,stroke:#19C7A6,color:#062B24
  classDef google fill:#FFB547,stroke:#FFB547,color:#3B2500
  class SP gmail
  class API,ED,CU,PL,TH engine
  class FS,GCS store
  class CI google
```

- The **add-on** (Apps Script, CardService) is the Gmail side panel. It calls the engine with the user's Google sign-in token.
- The **engine** (Node 20 on Cloud Run) checks the token, your domain and admin group, stores everything in **Firestore**, keeps pictures in a public **Cloud Storage** bucket, and serves the editor, customise and preview pages through **one-time tickets**.
- The **pipeline** turns any pasted or built email into Gmail-safe HTML and explains every change it made.

Read more in **[docs/architecture.md](docs/architecture.md)**.

---

## 🚀 Quick start

You need a Google Workspace domain and a Google Cloud project with billing.

```bash
git clone https://github.com/nexoradev-stack/Custom-Email-Template-Builder-Gmail.git
cd Custom-Email-Template-Builder-Gmail/engine
cp env.example.yaml env.yaml        # fill in your project, bucket, domain and admin group
npm ci && npm test                  # optional: run the tests locally

gcloud run deploy template-engine --source . --region us-central1 \
  --service-account template-engine@YOUR_PROJECT.iam.gserviceaccount.com \
  --allow-unauthenticated --env-vars-file env.yaml \
  --memory 2Gi --cpu 1 --max-instances 3 --timeout 60 --cpu-boost
```

Then paste `addon/Code.gs` and `addon/appsscript.json` into an Apps Script project, put your engine's URL in both, and install it as a test deployment.

📘 **Full step-by-step guide:** [docs/setup.md](docs/setup.md)

---

## 🎨 Make it yours

Your brand lives in settings, not in the code. Set these in `engine/env.yaml`:

| Setting | What it changes | Default |
|---|---|---|
| `APP_NAME` | Name on every page | `Template Gallery` |
| `BRAND_NAME` | Text in new header and footer rows | `Acme` |
| `BRAND_WEBSITE` | Default link for new buttons | `https://www.example.com` |
| `BRAND_LOGO_URL` | Small logo in the top band | `/assets/logo-mark.png` |
| `BRAND_INK` | Dark colour: top band, text, header rows | ![#17123B](https://img.shields.io/badge/-%2317123B-17123B?style=flat-square) |
| `BRAND_ACCENT` | Buttons, links, selection | ![#6C3BFF](https://img.shields.io/badge/-%236C3BFF-6C3BFF?style=flat-square) |
| `BRAND_SOFT` | Footer rows | ![#EDE8FF](https://img.shields.io/badge/-%23EDE8FF-EDE8FF?style=flat-square) |
| `BRAND_PAGE` | Page background | ![#F8F7FC](https://img.shields.io/badge/-%23F8F7FC-F8F7FC?style=flat-square) |

In the add-on, change `APP_NAME`, `BLUE` and `BLUE_DARK` at the top of `Code.gs`, and the name, colours and icon in `appsscript.json`. Details in [docs/setup.md](docs/setup.md#7-make-it-yours).

---

## 🗂️ Project structure

```
.
├── addon/                  Gmail add-on (Google Apps Script)
│   ├── Code.gs             side panel, compose box, admin cards
│   └── appsscript.json     add-on manifest
├── engine/                 Cloud Run engine (Node 20, Express)
│   ├── src/
│   │   ├── server.js       routes, Firestore, Cloud Storage, versions, tickets
│   │   ├── auth.js         token check, domain, admin group
│   │   ├── pipeline.js     Gmail-safe HTML: inline CSS, fonts, widths, checks
│   │   ├── blocks.js       finds the editable parts; locks
│   │   ├── theme.js        your brand settings
│   │   ├── editorPage.js   the editor tab
│   │   ├── builder.client.js   Build with blocks
│   │   ├── htmledit.client.js  Paste HTML: edit in preview, rows, undo
│   │   ├── customisePage.js    what users see when customising
│   │   └── …
│   ├── assets/             icon, logo and placeholders
│   ├── test/               node:test unit tests
│   ├── Dockerfile
│   └── env.example.yaml
├── examples/templates/     two ready-to-paste templates
└── docs/                   setup, architecture, guides, images
```

---

## 📏 Good to know

Gmail decides a lot about how emails look. The engine tells you when something will change instead of letting it break silently.

- **Web fonts don't load in Gmail.** Every font has a backup (usually Arial), and the check says which one people will see.
- **Mobile `@media` rules are removed by Gmail.** Widths are made fluid instead, so emails still fit phones.
- **Text inside pictures can't be edited.** Use real text for titles you want people to change.
- **Merge tags** like `{{FirstName}}` aren't filled in by Gmail. The check warns you about them.
- **Over 102 KB, Gmail cuts the email.** The check shows the size and stops you at the limit.
- The add-on runs in **Gmail on the web**. Gmail's phone apps don't show add-on side panels, but emails sent with it look right everywhere.

---

## 🤝 Contributing

Ideas, bug reports and pull requests are welcome. Start with **[CONTRIBUTING.md](CONTRIBUTING.md)**, and please report security problems privately as described in **[SECURITY.md](SECURITY.md)**.

---

## 💜 Credits

| | Who | Role |
|---|---|---|
| 🎨 | **Legends** ([@nexoradev-stack](https://github.com/nexoradev-stack)) | Product, design, testing and direction |
| 🤖 | **Claude** (Anthropic) | Code, architecture and docs, pair-built with Legends |
| ⌨️ | **Cursor** | AI code editor used in the build |

---

## 📄 Licence

[MIT](LICENSE). Use it, change it, and make it yours.
