# 📝 Changelog

## Unreleased
- Images: 1 MB limit on every upload, with a red message offering **Reduce it here** (a new in-browser image reducer page) or Google Squoosh
- Share with people: give a draft to named colleagues only; "Shared with you" in their gallery
- Image library: shows where each image is used; delete works even when templates use it (they keep the picture)
- Gmail check: link count line (information only); empty image rows are left out instead of blocking
- Publish shows a simple "Published for everyone" confirmation
- Gmail add-on redesign: category chips, icons on buttons, coloured status lines, a cleaner template page with a foldable Gmail check, new Images, Categories and Share pages
- Speed: heavy tools load on first use, JPEG thumbnails, admin actions return the updated template in one call, a quick retry when the engine is waking up, and a 45-second gallery memory in the add-on
- Docs: what it costs to run (no AI or API keys needed), with weekly, monthly and yearly examples and a simple way to calculate your own cost
- Engine: page styles moved into CSS files

## 1.0.0 — November 2026
First public release.

- Gmail add-on: gallery with categories, Preview, Customise, Add to email (side panel and Compose box)
- Admin: Paste HTML with Edit in preview (text, buttons, images, rows, header and footer rows)
- Admin: Build with blocks (header, image, text, button, image + text, columns, divider, space, footer)
- Locks per part and per row; View as user
- Undo and redo (50 steps), versions with Restore, Make a copy, save-clash warning
- Categories: show/hide, add, rename, delete with move
- Image library: upload, copy into library, cut to shapes, safe remove
- Gmail-safe pipeline: inline CSS, 39 fonts with backups, fluid widths, image and size checks
- Fast publish with background thumbnails
- Brand settings: name, website, logo and colours
