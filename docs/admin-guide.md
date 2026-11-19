# 🎨 Admin guide

Admins are members of the admin Google Group. In the Gmail panel you'll see **New template**, **Upload image**, **Images**, **Categories**, **Teams** and **View as user**.

## Make a template

**New template → Open editor** opens the editor in a new tab. Pick a way to build:

### Paste HTML
1. Paste email code into the code box. Code from Figma email plugins, ChatGPT, Gemini or Claude works well (see the [prompt in examples](../examples/README.md#-a-prompt-that-gives-great-email-code)).
2. **Save and check**. The checklist shows what was made Gmail-safe and anything to fix.
3. **Edit in preview** to change things without touching code:
   - **Text:** font, size, colour, **B** / *I* / U, alignment, links (plain or bold)
   - **Buttons:** words, link, button colour, text colour, corners
   - **Pictures:** Upload, From library, Copy into library, height shapes, alt text, click link
   - **Rows** (blue buttons on the left): ⠿ drag, ↑ ↓ move, ⧉ copy, 🔒 lock, ⚙ background and spacing, 🗑 delete
   - **＋** under a row: add Text, Image, Image + text, Button, Columns, Divider, Space, **Header** (top) or **Footer** (bottom)
4. **User changes** shows every part, with a switch to lock it.

### Build with blocks
Pick rows from the left (Header, Image, Text, Button, Image + text, Columns, Divider, Space, Footer), click a row to edit it in the email, and use the right panel for fonts, sizes, colours, spacing, image heights, the email width and *Let users change this*.

## Undo and redo
`Cmd/Ctrl + Z` and `Cmd/Ctrl + Shift + Z`, or the ↶ ↷ buttons, for the last 50 changes. Typing undoes in bursts.

## Publish, versions and copies
- **Publish for everyone** makes the template live in a few seconds. The thumbnail follows shortly; click the status line on the template page to update it.
- **Share with people** (next to Publish) gives a draft only to the colleagues you name. They see it under **Shared with you** at the top of their gallery; nobody else does. They get a fixed copy: after you change the template, click **Share** again to send them the latest. Publishing for everyone ends the sharing.
- **Versions** lists every publish with who and when. **Restore** puts an older one back as a new version.
- **Make a copy** creates "name (copy)" as a draft.
- **Unpublish** hides a template from users. **Delete** removes it.
- If another admin saved the same template since you opened it, you'll be warned before overwriting their work.

## Categories and who sees them
Open **Categories**, then **Open** on a category. Under **Who can see it** choose **Everyone**, or **Only these teams and people** and add teams or single email addresses. Nobody added means only admins see it, and every new category starts that way. You can also rename a category (its templates and who can see it follow) or delete it (choose where its templates move).

## Teams
A team is a named list of people. Open **Teams** in the gallery, make a team, and add people by email (several at once, separated by commas). Give a team categories on each category's page. Deleting a team takes it off every category; people added by email keep their access.

## Hidden templates
Every template page has a **Hidden** switch. When it's on, users and the people a draft is shared with stop seeing the template, and old preview links stop working. Admins still see it everywhere, with a grey "Hidden" line and a **Hidden** filter in the gallery. Switch it off and everything comes back, sharing included. Nothing is deleted.

## Image library
Upload pictures once and reuse them. Each picture must be **1 MB or smaller**: a bigger one shows a red message with **Reduce it here**, which opens the built-in image reducer, or a link to Google Squoosh.

The image list shows where each picture is used. **Delete** works even when templates use it: the file stays online, so those templates, their old versions, people's customised copies and emails already sent keep showing it. It just leaves the list for new templates.

An **image row left empty** in Build with blocks is simply left out of the email.

## Tips for templates that look great everywhere
- Use **real text** for titles. Text inside pictures can't be edited and disappears for people who block images.
- Give pictures **alt text**.
- Logos with a **see-through background** can vanish on Gmail's dark mode. Export them on white.
- Check **View as user** before publishing.
