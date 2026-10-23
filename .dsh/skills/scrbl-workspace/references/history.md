# Compact feature history

This is the durable, repository-level history of the work that shaped the current app. It intentionally omits machine and session details.

## 1. Baseline note app

The repository was a small Django publishing app: a markdown editor (`templates/tapnote/editor.html`), a published note view (`templates/tapnote/view_note.html`), per-note font choices (`tapnote/fonts.py`), a markdown/YouTube pipeline in `tapnote/views.py`, and a vendored ParaNote comment UI in `static/js/paranote.js`.

## 2. Browser title follows the note heading

- Added a `title` block to `templates/tapnote/base.html`.
- `view_note` now passes `page_title`.
- The title is the explicit note title, or the first markdown heading when untitled.
- Format: `Heading • scrbl`; empty note falls back to `scrbl`.

## 3. Live editor preview and font preview

- Added the read-only `preview_note` endpoint at `/preview/`.
- Introduced `_note_preview.html` and the shared `render_markdown_html` pipeline.
- Reused the exact published-note markdown pipeline, including strikethrough, tables, footnotes, links, and YouTube embeds.
- Built a two-column editor/preview layout (stacked on mobile).
- `editor.js` debounces preview updates, ignores stale responses, and applies the selected font's Google Font and CSS stack immediately.
- Fonts are still only persisted on Update/Publish.

## 4. Basic formatting toolbar

- Added a toolbar above the title in `editor.html` and matching logic in `editor.js`.
- Buttons: bold, italic, underline (`<u>`), H1–H6, bulleted list, numbered list, link.
- Selection is preserved across button focus, including touch.
- Bold/italic toggling understands asterisk runs, so nested styles survive.
- Headings and lists operate on whole lines and preserve indentation.
- Link insertion selects the placeholder URL or placeholder label.
- Every edit dispatches a bubbling `input` event to refresh auto-grow and the live preview.

## 5. Mobile overflow pass

- Added wrapping for long words, URLs, and links.
- Capped media and iframes to the reading column; YouTube embeds became 16:9.
- Mobile titles became smaller and break-word aware.
- Code blocks and tables wrap on small screens rather than forcing horizontal scrolling.
- Action rows use wrapping and mobile-safe padding.

## 6. Dark / light theme

- Added `theme.js`, the shared `_theme_toggle.html` pill, and a pre-paint theme bootstrap in `base.html`.
- Theme is stored under `scrbl-theme` in `localStorage`.
- Tailwind is configured for class-based dark mode and `<html>` carries the `dark` class.
- All app surfaces got dark variants: page, note header, markdown links/code/quotes/tables, editor controls, formatting toolbar, font picker, preview, setup, migration, and error states.
- Toggle appears:
  - left of Publish/Update in the editor;
  - left of Backup Edit Link on an editable public note;
  - top-right on a public note without edit permission.

## 7. Backup and delete pills

- Backup Edit Link is a pill matching the other actions.
- Added `delete_note`, using the same `has_edit_permission` token logic as edit.
- Delete is POST-only and CSRF-protected, removes associated TapNote comments, clears the edit cookie, and redirects home.
- Delete appears only on a public editable note, as the rightmost pill:
  `Dark/Light`, `Backup Edit Link`, `Edit`, `Delete`.

## 8. Dark ParaNote sidebar

- Added `--na-*` CSS variables in `styles.css` for the comment panel: panel, list, cards, replies, inputs, borders, text, meta text, empty state, quotes, badges, shadows, and actions.
- `paranote.js` now references those variables in its inline styles.
- Light mode keeps the previous palette; dark mode flips every sidebar surface and updates even if the theme changes while the panel is open.
- Comment-count badges on paragraphs use the same variables.

## Current verification baseline

`python manage.py test tapnote` passes 90 tests. JS files pass `node --check`. There is no frontend build step.
