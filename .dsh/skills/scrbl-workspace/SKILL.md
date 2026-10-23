---
name: scrbl-workspace
description: Use when working on the scrbl Django note app in this repository — architecture, editor/preview and formatting toolbar, note permissions and deletion, dark theme including ParaNote comments, mobile overflow behavior, static cache busting, and sandbox-safe test workflows.
whenToUse: Any feature, bug fix, UI change, or verification run for the scrbl app.
metadata:
  stack: Django
  area: note editor and publishing
---

# scrbl workspace guide

A practical map of this repository's conventions and the quirks that are easy to rediscover the hard way. Paths are repository-relative; nothing here depends on the host machine.

## Start with the right files

- `prototype/settings.py`, `prototype/urls.py` — Django project wiring.
- `tapnote/models.py`, `tapnote/views.py`, `tapnote/fonts.py` — note data, permissions, markdown pipeline, typography choices.
- `templates/tapnote/base.html` — shared shell, title block, Tailwind/Fonts, theme bootstrap.
- `templates/tapnote/editor.html` — new-note and edit-note screen (toolbar, title/author/body, font picker, live preview).
- `templates/tapnote/view_note.html` — published note, edit/backup/delete actions, theme toggle, comments loader.
- `templates/tapnote/_note_preview.html` — server-rendered preview fragment.
- `templates/tapnote/_theme_toggle.html` — shared theme pill.
- `static/js/editor.js` — live preview, font preview, formatting toolbar, textarea growth.
- `static/js/theme.js` — theme toggling and localStorage persistence.
- `static/js/paranote.js` — vendored comment UI; sidebar colors are driven by CSS variables.
- `static/css/styles.css` — reading typography, wrapping, dark palette, ParaNote variables.
- `tapnote/tests.py` — all server-side coverage.

## Verify changes

```bash
python manage.py test tapnote
node --check static/js/editor.js
node --check static/js/theme.js
node --check static/js/paranote.js
```

At the time this skill was written the suite had 90 tests. There is no frontend build step: Tailwind and Google Fonts load from CDNs, and Django/WhiteNoise serves the static files.

## Testing quirks

`requirements.txt` intentionally pins **Django 4.2.2**. Do not bump it just to make a local test run work.

If the available interpreter is newer than the pinned Django supports, template rendering can fail inside `django.template.context` (often `Context.__copy__`). A reliable workaround is:

1. Keep production requirements untouched.
2. Install a newer, compatible Django into a disposable, gitignored `testdeps/` directory.
3. Run tests with that directory first on `PYTHONPATH`:
   ```bash
   PYTHONPATH=testdeps python manage.py test tapnote
   ```
4. Delete `testdeps/` afterward.

Under the DSH file sandbox, `pip` can create temp extraction directories that the process cannot reopen, producing permission errors while writing wheel metadata. A pure-Python fallback works: query the package index with `urllib`, pick a `py3-none-any` wheel, and extract it with `zipfile` into `testdeps/`. This avoids pip's temp directory entirely.

Other sandbox notes:

- Prefer the `write`/`edit` tools for repository files. Spawned Node or Python child processes may be denied file writes even though shell commands can read.
- Headless browser automation may be blocked. For server behavior use the Django test client. For editor JS, run the file under Node with a small fake DOM (fake textarea implementing `value`, `selectionStart/End`, `setRangeText`, `setSelectionRange`, `dispatchEvent`; fake toolbar with `addEventListener`). That catches formatting/toggle bugs without a browser.
- `db.sqlite3`, `testdeps/`, `.check_*.py`, `.render_check.mjs`, and `.piptmp/` are gitignored scratch paths. Clean them up after a verification session.

## Static assets and caching

Every changed JS/CSS asset needs its query version bumped at the reference site, otherwise phones and browsers keep the old file:

- `templates/tapnote/base.html`: `css/styles.css?v=...`, `js/theme.js?v=...`.
- `templates/tapnote/editor.html`: `js/editor.js?v=...`.
- `templates/tapnote/view_note.html`: `js/paranote.js?v=...`.

Templates themselves are server-rendered and do not need cache busting.

## Markdown pipeline

Use `render_markdown_html(md_text, target=...)` in `tapnote/views.py` for both published notes and previews:

1. Apply the `~~strikethrough~~` regex first.
2. Convert with `markdown.Markdown(extensions=['fenced_code', 'tables', 'footnotes'])`.
3. Run `process_markdown_links` (adds `target`/`rel` and converts YouTube links to embeds).

Raw HTML is allowed, which is why underline can use `<u>…</u>`. The templates display rendered HTML with `|safe`.

## Editor and live preview

- `home` (new note) and `edit_note` both render `templates/tapnote/editor.html`; published notes render `view_note.html`.
- The editor is a two-column write/preview layout on desktop and stacked on mobile.
- The preview endpoint is `preview_note` at `/preview/`. It is read-only, capped at `MAX_CONTENT_LENGTH`, and renders `_note_preview.html`; it never saves.
- `editor.js` updates the preview with a short debounce and ignores stale responses via a sequence number.
- Font choices come from `tapnote/fonts.py`. Each `<option>` carries `data-google-family` and `data-stack`; changing the select loads the Google font and applies the stack to the preview immediately.
- The formatting toolbar is server-rendered in `editor.html` and handled by `editor.js`:
  - bold/italic use asterisk-run-aware toggling;
  - underline uses `<u>` because Markdown has no underline;
  - headings and lists operate on whole selected lines, preserving indentation;
  - link inserts `[label](url)` and selects the placeholder URL (or the placeholder label when nothing is selected);
  - the textarea selection is remembered before the button can take focus, including on touch;
  - every programmatic edit dispatches a bubbling `input` event so auto-grow and the live preview update.
- When adding a new editor action, use `setRangeText` for simple replacements; for line rewrites, compute the block from the current line and restore the selection afterward.

## Note permissions and deletion

`has_edit_permission(request, note)` in `tapnote/views.py` is the single authority for note edits. It accepts either:

- the `edit_token_<hashcode>` cookie, or
- the `?token=` query parameter,

and compares in constant time. Reuse it for any new note action rather than reimplementing token checks.

`delete_note` is the destructive-action template:

- looks up the note and checks `has_edit_permission`;
- requires POST;
- is CSRF-protected (the public editable page renders `{% csrf_token %}` in the delete form);
- deletes the note's TapNote comments (`site_id='tapnote'`, `work_id=hashcode`);
- deletes the note, clears the edit cookie, and redirects home.

The Delete pill appears only on a public editable note. The action row order is theme toggle, Backup Edit Link, Edit, Delete.

## Page title

`base.html` exposes `{% block title %}`. `view_note` computes `page_title` from the explicit title or the first line's heading and passes `Heading • scrbl`; an empty note falls back to `scrbl`.

## Theme and comments

- `theme.js` toggles the `dark` class on `<html>`, stores the choice in `localStorage` under `scrbl-theme`, and updates toggle labels/aria text.
- `base.html` runs a tiny inline script before Tailwind to apply persisted dark mode before first paint.
- Tailwind is configured with `darkMode: 'class'`; the app uses `dark:` variants for controls, headers, and buttons.
- Reading content dark overrides live in `styles.css` (`html.dark .markdown-content …` for links, code blocks, blockquotes, rules, and table borders).
- ParaNote comment colors are CSS variables, not hardcoded values:
  - light values live in `:root`;
  - dark values live in `html.dark`;
  - `paranote.js` inline styles reference `var(--na-*)`.
- When changing any comment UI color, add or adjust a variable in both blocks. The sidebar, cards, inputs, replies, empty state, quote boxes, badges, and shadows already use this system, so toggling the theme while the panel is open updates immediately.

## Mobile and overflow

`styles.css` prevents horizontal page scrolling by wrapping long content:

- `html, body` are capped to the viewport width;
- long words and URLs wrap (`overflow-wrap: break-word/anywhere`);
- note titles use a smaller mobile size and `break-words`;
- images, videos, and iframes are capped to the container; YouTube embeds keep 16:9;
- at `max-width: 640px`, code blocks and tables wrap instead of scrolling sideways.

New editor controls should stay inside a `min-w-0` grid child and use `flex-wrap` for action rows.

## Change checklist

1. Find the view/template/static/test that owns the behavior.
2. Keep the markdown pipeline shared rather than copying it.
3. Add server tests for permissions, no-write behavior, and UI presence/order where applicable.
4. Bump the relevant `?v=` asset version.
5. Run the Django suite and `node --check` on changed JS.
6. Remove scratch test directories and the local database.

For the compact feature history that led to the current state, read `references/history.md`. For deeper environment/testing notes, read `references/tooling.md`.
