# 🚀 Setup guide

This takes about 45 minutes the first time. You need:

- a **Google Workspace** domain (the add-on only works for accounts on it)
- a **Google Cloud project** with billing, where you can enable APIs and deploy Cloud Run
- the **gcloud** CLI (Cloud Shell in the browser works fine, with nothing to install)
- permission to create a **Google Group** for your template admins

Throughout this guide, replace:

| Placeholder | Example |
|---|---|
| `YOUR_PROJECT` | `acme-templates` (project **id**) |
| `YOUR_PROJECT_NUMBER` | `123456789012` (on the project's dashboard) |
| `YOUR_BUCKET` | `acme-email-images` (must be globally unique) |
| `example.com` | your Workspace domain |

---

## 1. Turn on the Google Cloud services

```bash
gcloud config set project YOUR_PROJECT

gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  firestore.googleapis.com storage.googleapis.com cloudidentity.googleapis.com
```

## 2. Create the database and the image library

```bash
# Firestore database (Native mode) called "templates"
gcloud firestore databases create --database=templates --location=us-central1

# Public bucket for pictures used in emails (recipients must be able to load them)
gcloud storage buckets create gs://YOUR_BUCKET --location=us-central1 --uniform-bucket-level-access
gcloud storage buckets add-iam-policy-binding gs://YOUR_BUCKET \
  --member=allUsers --role=roles/storage.objectViewer
```

> 💡 Pictures must be public, because email recipients load them from the internet. Don't put anything private in this bucket.

## 3. Give the engine its own account

```bash
gcloud iam service-accounts create template-engine --display-name="Template engine"

gcloud projects add-iam-policy-binding YOUR_PROJECT \
  --member=serviceAccount:template-engine@YOUR_PROJECT.iam.gserviceaccount.com \
  --role=roles/datastore.user

gcloud storage buckets add-iam-policy-binding gs://YOUR_BUCKET \
  --member=serviceAccount:template-engine@YOUR_PROJECT.iam.gserviceaccount.com \
  --role=roles/storage.objectAdmin
```

## 4. Create the admin group

In the [Google Admin console](https://admin.google.com) or [Google Groups](https://groups.google.com), create a group such as `template-admins@example.com` and add the people who may build and publish templates.

> 💡 In the group's settings, let **organisation members** see the member list. The engine checks admin rights with the person's own sign-in.

## 5. Deploy the engine

```bash
git clone https://github.com/nexoradev-stack/Custom-Email-Template-Builder-Gmail.git
cd Custom-Email-Template-Builder-Gmail/engine
cp env.example.yaml env.yaml
```

Open `env.yaml` and fill in at least:

```yaml
PROJECT_NUMBER: "YOUR_PROJECT_NUMBER"
IMAGE_BUCKET: "YOUR_BUCKET"
FIRESTORE_DB: "templates"
ALLOWED_DOMAIN: "example.com"
ADMIN_GROUP: "template-admins@example.com"
```

Then deploy:

```bash
gcloud run deploy template-engine --source . --region us-central1 \
  --service-account template-engine@YOUR_PROJECT.iam.gserviceaccount.com \
  --allow-unauthenticated --env-vars-file env.yaml \
  --memory 2Gi --cpu 1 --max-instances 3 --timeout 60 --cpu-boost
```

> Optional: add `--min-instances 1` to keep one copy of the engine always running. The add-on then opens without a wait after quiet periods (Google charges for the always-on instance).

When it finishes, copy the **Service URL**, for example `https://template-engine-abc123-uc.a.run.app`. Check that `https://…/health` answers `{"ok":true}`.

> `--allow-unauthenticated` only opens the door. Every request is still checked: the API needs a Google sign-in token from your domain, and the editor pages need a one-time ticket.

## 6. Install the Gmail add-on

1. **OAuth consent screen:** in Google Cloud → *APIs & Services → OAuth consent screen*, choose **Internal**, give it a name and your support email, and save.
2. Go to [script.google.com](https://script.google.com) → **New project**, and name it (for example "Template Gallery").
3. **Project settings** (⚙️):
   - tick **Show "appsscript.json" manifest file in editor**
   - under *Google Cloud Platform project*, click **Change project** and enter `YOUR_PROJECT_NUMBER`
4. Replace the content of `Code.gs` with [`addon/Code.gs`](../addon/Code.gs), and of `appsscript.json` with [`addon/appsscript.json`](../addon/appsscript.json).
5. Put your Service URL in **four places**:
   - `API_BASE` at the top of `Code.gs` (no slash at the end)
   - `urlFetchWhitelist`, `openLinkUrlPrefixes` and `logoUrl` in `appsscript.json` (keep the slash at the end of the first two)
6. Save, then **Deploy → Test deployments → Install**.
7. Open Gmail and reload. The add-on icon appears on the right edge. The first time, Google asks you to allow access.

> 🔐 The engine accepts only tokens issued to an OAuth client of `YOUR_PROJECT_NUMBER`, which is why step 3 links the script to your project. For a stricter check, also set `OAUTH_CLIENT_ID` in `env.yaml`.

### Rolling it out to everyone

A test deployment works for you and anyone you share the script with. For the whole company, publish a **private Google Workspace Marketplace listing** from the same Cloud project (*Google Workspace Marketplace SDK → App configuration*, using a versioned deployment of the script), then ask a Workspace super admin to **install it for the domain**.

## 7. Make it yours

**Engine** (`engine/env.yaml`, then deploy again):

```yaml
APP_NAME: "Template Gallery"
BRAND_NAME: "Acme"
BRAND_WEBSITE: "https://www.acme-corp.io"
BRAND_LOGO_URL: "https://storage.googleapis.com/YOUR_BUCKET/brand/logo-mark.png"
BRAND_INK: "#17123B"
BRAND_ACCENT: "#6C3BFF"
BRAND_SOFT: "#EDE8FF"
BRAND_PAGE: "#F8F7FC"
```

**Add-on:**
- `Code.gs`: `APP_NAME`, `BLUE` (your accent) and `BLUE_DARK` (a darker shade)
- `appsscript.json`: `name`, `primaryColor`, `secondaryColor`, the compose action text, and `logoUrl` (a 512 × 512 PNG works best)

**Categories:** the first time the engine starts, it creates *Events, Sales, Newsletters, HR, General*. Rename, hide, add or delete them from **Categories** in the add-on.

## 8. Updating

```bash
cd Custom-Email-Template-Builder-Gmail && git pull
cd engine && gcloud run deploy template-engine --source . --region us-central1 \
  --service-account template-engine@YOUR_PROJECT.iam.gserviceaccount.com \
  --allow-unauthenticated --env-vars-file env.yaml \
  --memory 2Gi --cpu 1 --max-instances 3 --timeout 60 --cpu-boost
```

If `addon/` changed, paste the new `Code.gs` into Apps Script and save. Test deployments pick it up straight away.

---

## 🩺 Troubleshooting

| You see | Do this |
|---|---|
| "Sign-in could not be verified" | The script isn't linked to `YOUR_PROJECT_NUMBER` (step 6.3), or `PROJECT_NUMBER` in `env.yaml` is wrong. |
| "This tool is for example.com accounts only" | `ALLOWED_DOMAIN` doesn't match your Workspace domain. |
| Admin buttons don't appear | Check `ADMIN_GROUP`, that you're a member, and that members can see the member list. `ADMIN_EMAILS` works as a temporary safety net. |
| Pictures don't show in sent emails | The bucket isn't public (step 2). |
| "The query requires an index" in Cloud Run logs | Open the link in the log line. Firestore creates the index in a minute. |
| Thumbnails stay on "Preview coming soon" | Click **Refresh** in the panel after a minute. Thumbnails are made in the background after publishing. |
