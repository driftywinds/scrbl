# scrbl

scrbl is a minimalist, self-hosted publishing platform inspired by Telegra.ph, focused on instant Markdown-based content creation. It gives you a distraction-free editor, a live rendered preview, and a clean reading page for quick notes, blog posts, or documentation.

[**🔴 Live Demo**](https://zoidbergxgd.pythonanywhere.com/)

**✨ Key Features:**

- ✍️ **Focused Markdown editor** with a live rendered preview as you type
- 🧰 **Formatting toolbar** for bold, italic, underline, H1–H6, bulleted/numbered lists, and links
- ↩️ **Automatic list continuation** — press Enter to create the next list item; press Enter again on an empty item to leave the list
- 🎨 **Per-note typography** with a live font preview
- 🌗 **Dark / light mode** that persists across notes and pages, including the comments sidebar
- 📱 **Mobile-friendly reading** — long titles, URLs, code, and tables wrap instead of causing sideways scrolling
- 📝 **Telegra.ph experience** — title and author fields, 8-character short links, and a browser tab title derived from the note heading
- 🖼️ **Social previews** — Open Graph and Twitter Card metadata for shared links
- 💬 **Paragraph-level comments** with likes, moderation, and fuzzy re-anchoring after edits
- 🗑️ **Token-based editing and deletion** with the same secure permission
- 📦 **Data migration** — import and export notes as JSON
- 🚀 **Deployment and automation** — Docker, PythonAnywhere scripts, renewal automation, and GitHub Actions

![Demo](media/demo.gif)

## Features

### Writing and formatting

- Clean, distraction-free Markdown editor with no account required
- Live preview that uses the same Markdown pipeline as the published page, including strikethrough, tables, footnotes, fenced code, blockquotes, images, links, and YouTube embeds
- Formatting toolbar that works on the current selection or line:
  - **Bold**, **italic**, and **underline**
  - **H1–H6** headings
  - Bulleted and numbered lists
  - Link insertion (`[text](url)`)
- Buttons toggle where appropriate; bold/italic nesting is preserved
- Pressing **Enter** on an ordered or unordered list line:
  - continues the list automatically (`1.` → `2.`, `-` → `-`)
  - preserves indentation and `1.` / `1)` marker styles
  - removes an empty list item and exits the list when you press Enter on it
- Per-note typography: IBM Plex Sans (default), Source Sans 3, Newsreader, Source Serif 4, or EB Garamond
- Font changes preview immediately on the rendered article, but are only saved when you click **Update** / **Publish**
- Mobile-safe wrapping: long titles, URLs, links, inline code, code blocks, tables, images, and embeds stay inside the reading column

### Publishing and content management

- Instant publishing with short, shareable 8-character URLs
- Optional **Title** and **Author** fields with a clean Telegra.ph-style header
- Browser tab title follows the note heading (`Heading • scrbl`)
- Automatic **Open Graph** and **Twitter Card** metadata, including note images
- Secure edit access through a token cookie or a tokenized URL
- **Backup Edit Link** copies a tokenized recovery URL
- Notes can be **deleted** by anyone with edit permission:
  - a confirmation prompt is shown
  - deletion is POST-only and CSRF-protected
  - the note's comments are removed and the edit cookie is cleared
- Proper rendering of GitHub-flavored-style Markdown features supported by the app, including strikethrough, tables, footnotes, code, and images
- 200,000-character note limit and 2.5 MB upload limit for stability

### Appearance and accessibility

- Persistent dark/light toggle on the editor, editable notes, and public notes
- The choice is remembered per browser and applied before first paint
- Dark mode covers the editor, preview, published note, markdown content, form controls, and the ParaNote comments sidebar
- Light mode keeps the original clean white-and-black palette
- Responsive layout with generous mobile padding and wrapped action rows
- Note titles, bylines, and action pills adapt to small screens

### Comments and community

- Paragraph-level comments powered by [ParaNote](https://github.com/zoidberg-xgd/paranote)
- Comments and replies anchored to the paragraph they discuss
- Fuzzy re-anchoring keeps comments attached to the right paragraph even after the note body is edited
- Likes on comments
- Moderation tools: admins and note authors can delete comments, and admins can ban/unban users
- Comments can be disabled with the `ENABLE_COMMENTS` environment setting
- The entire comment panel—cards, replies, inputs, empty state, and count badges—follows the app's dark/light theme

### Data, administration, and automation

- **Data migration** page for exporting all notes to JSON and importing them back
- `scripts/txt2tapnote.py` for batch-importing text files as notes
- Django admin interface for notes and comments
- First-run setup page to create the initial administrator account
- `scripts/renew_pa.py` and GitHub Actions automation for renewing a PythonAnywhere free web app
- Comprehensive Django test suite and CI workflows

## Quick Start

1. Clone the repository:
```bash
git clone https://github.com/driftywinds/scrbl.git
cd scrbl
```

2. Start the application with Docker:
```bash
chmod +x setup.sh
./setup.sh
```

3. Open scrbl at `http://localhost:9009`.

On first launch, scrbl redirects to a setup page where you create the administrator account.

## Using scrbl

1. **Write** a note in the editor, or start by selecting a font.
2. **Format** text with the toolbar, or use Markdown directly. Lists continue automatically when you press Enter.
3. **Preview** the rendered article in the live preview panel; changing the font updates the preview immediately.
4. **Publish** when ready. The editor is the same screen for new notes and later edits.
5. **Edit** from the published note using the Edit button, or copy a recovery link with Backup Edit Link.
6. **Delete** from the published note when you have edit permission. The confirmation is intentional and permanent.
7. **Toggle the theme** at any time; the choice is remembered.

## Examples

````Markdown
# Heading 1
Some paragraph text here.

![Image](https://themepreview.home.blog/wp-content/uploads/2019/07/boat.jpg)

## Heading 2
Another paragraph of text with some **bold** text, *italic* text, and ~~strikethrough~~ text.

### Heading 3
1. An ordered list item
2. Another ordered list item

```python
# Some Python code snippet
def greet(name):
    return f"Hello, {name}!"
```

#### Heading 4
A quote block:
> This is a blockquote!

- Sub list item (unordered)
- Sub list item (unordered)

#### Table Example
| Column A | Column B |
|----------|----------|
| Cell 1A  | Cell 1B  |
| Cell 2A  | Cell 2B  |

https://youtu.be/vz91QpgUjFc?si=6nTE2LeukJprXiw1
````

## Deployment

### Docker

The quickest path is the provided setup script:

```bash
chmod +x setup.sh
./setup.sh
```

### PythonAnywhere

The repository includes deployment helpers and documentation:

- `deploy_pa.sh` — deployment script
- `scripts/renew_pa.py` — renewal automation for the free web app
- `DEPLOY_PYTHONANYWHERE.md` — deployment guide
- `UPDATE_PYTHONANYWHERE.md` — update guide
- `.github/workflows/renew_pa.yml` — scheduled renewal workflow

## Testing

scrbl includes unit and integration coverage for models, views, the Markdown pipeline, live preview, permissions, deletion, CSRF behavior, comments, and editor/theme markup.

```bash
# Django test runner
python manage.py test

# Test script
./run_tests.sh

# With coverage report
./run_tests.sh --coverage
```

CI runs the test suite through GitHub Actions.

## Use Cases

- **Personal blog** — publish Markdown articles quickly
- **Quick notes** — write and share a clean page without an account
- **Team discussion** — comment on specific paragraphs and reply in context
- **Self-hosted publishing** — keep full control of your content and data
- **Content backup** — export and restore notes as JSON

## Contributing

Feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT License](LICENSE)

## Acknowledgments

- Inspired by [Telegra.ph](https://telegra.ph)
- Originally based on concepts from [vorniches/tapnote](https://github.com/vorniches/tapnote)
- Built with Django and Tailwind CSS
- Uses [Prototype](https://github.com/vorniches/prototype), [snap2txt](https://github.com/vorniches/snap2txt), and [Cursor](https://cursor.so)
- Note typography is chosen per note: IBM Plex Sans (default), Source Sans 3, Newsreader, Source Serif 4, or EB Garamond, all by Google Fonts
- Comment system powered by [ParaNote](https://github.com/zoidberg-xgd/paranote)

## Support

- Create an issue for bug reports or feature requests
- Star the repository if you find it useful
- Fork it to contribute or create your own version
