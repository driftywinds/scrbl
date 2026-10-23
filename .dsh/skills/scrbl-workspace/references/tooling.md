# Tooling and verification notes

These are the repeatable methods that worked for this repository. Nothing here records machine names, user paths, ports, or credentials.

## Django test suite

```bash
python manage.py test tapnote
```

The suite uses Django's test database, so it does not need a checked-in `db.sqlite3`. At the time of writing it contains 90 tests covering models, views, the markdown pipeline, permissions, preview, deletion, CSRF, and theme/toolbar markup.

## When the pinned Django and the interpreter disagree

`requirements.txt` pins Django 4.2.2. If the available interpreter is newer than that Django release supports, template rendering can fail inside `django.template.context`, typically while copying `Context` during test-client template capture. Do not change `requirements.txt` just to make the test run work.

Working pattern:

1. Install a newer, compatible Django into a disposable `testdeps/` directory.
2. Put that directory first on `PYTHONPATH`.
3. Run the suite.
4. Remove `testdeps/` afterward.

```bash
PYTHONPATH=testdeps python manage.py test tapnote
```

## When pip temp extraction is denied

Under the DSH file sandbox, pip can create temp directories that deny subsequent access, failing while writing a wheel's metadata. A pure-Python wheel fetch avoids pip's temp directory. The shape that works:

```python
import io
import json
import os
import urllib.request
import zipfile

PACKAGES = [
    ("Django", "<compatible-version>"),
    ("Markdown", "3.4.1"),
    ("dj-database-url", "2.1.0"),
    ("whitenoise", "6.5.0"),
    ("asgiref", "<compatible-version>"),
    ("sqlparse", "<compatible-version>"),
    ("tzdata", "<compatible-version>"),
    ("typing-extensions", "<compatible-version>"),
]

TARGET = os.path.abspath("testdeps")
os.makedirs(TARGET, exist_ok=True)

for name, version in PACKAGES:
    with urllib.request.urlopen(f"https://pypi.org/pypi/{name}/{version}/json", timeout=60) as response:
        metadata = json.load(response)

    wheel = next(
        item for item in metadata["urls"]
        if item["packagetype"] == "bdist_wheel"
        and ("py3-none-any" in item["filename"] or "py2.py3-none-any" in item["filename"])
    )
    with urllib.request.urlopen(wheel["url"], timeout=120) as response:
        payload = response.read()
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        archive.extractall(TARGET)
```

This installs pure-Python wheels without invoking pip's unpack pipeline. `dj-database-url` imports `typing_extensions`, so include it.

## Editor JS without a browser

Headless browser processes may be blocked by the sandbox. A Node VM with a tiny fake DOM is enough for the formatting toolbar logic:

- Fake `document.querySelector` / `getElementById` for the textarea, form, toolbar, and optional preview/font elements.
- Fake textarea fields: `value`, `selectionStart`, `selectionEnd`, `style`, `scrollHeight`.
- Implement `setRangeText(text, start, end)` by splicing `value` and moving the caret.
- Implement `setSelectionRange(start, end)`, `focus()`, `dispatchEvent()`, and `addEventListener()`.
- Implement a fake toolbar that records listeners and fires a click with a target exposing `dataset.format` and `closest()`.
- Implement a fake form with `dataset.previewUrl` empty so preview fetches are skipped.
- Set `window.PointerEvent` and no-op `window.addEventListener`, `scrollTo`, and `document.documentElement`.
- Load `static/js/editor.js` with `vm.runInThisContext`, invoke the registered `DOMContentLoaded` callback, then drive formatting buttons and assert `value` plus selection.

This caught nested bold/italic, line transformation, and empty-selection behavior without a browser.

## Browser and server checks

- Server-rendered behavior: use `django.test.Client` (including `Client(enforce_csrf_checks=True)` for destructive actions).
- HTML presence/order: decode `response.content` and compare `index()` positions.
- CSS behavior cannot be meaningfully unit tested here; keep the wrapping and dark-mode rules centralized and inspect the rendered class/HTML instead.

## Static cache busting

When changing:

- CSS or `theme.js`: bump the `?v=` in `templates/tapnote/base.html`.
- `editor.js`: bump the `?v=` in `templates/tapnote/editor.html`.
- `paranote.js`: bump the `?v=` in `templates/tapnote/view_note.html`.

Use a new value for each batch of changes. Without it, mobile browsers can keep the old asset after a deploy.

## Scratch cleanup

These paths are gitignored and safe to remove after verification:

- `testdeps/`
- `db.sqlite3`
- `.check_*.py`
- `.render_check.mjs`
- `.piptmp/`

Prefer the `write`/`edit` tools for source edits. Spawned Node/Python processes can be denied file writes by the sandbox even when shell reads work. If a scratch filename was previously created and removed, the write tool may report that the file no longer exists; use a fresh filename or recreate it with a read first.

## Workspace skill location

Project skills are discovered from `.dsh/skills/`. A bundle is `.dsh/skills/<kebab-name>/SKILL.md` with YAML frontmatter (`name`, `description`, optional `whenToUse`, `metadata`). The provider watches the root and refreshes the session catalog, so a newly added skill appears without a restart. `.agents/skills/` is an alternative project root.

## URL routing quirk

`prototype/settings.py` sets `APPEND_SLASH = False`. New root URL patterns must include the exact trailing slash they are requested with; the app's note/edit/delete/preview routes all end in `/`.

## Theme details to keep in sync

- `theme.js` uses the `dark` class on `<html>` and the `scrbl-theme` localStorage key.
- `base.html` has a pre-paint script so persisted dark mode does not flash light.
- Tailwind must remain configured with `darkMode: 'class'`.
- ParaNote colors must be added to both `:root` and `html.dark` variable blocks in `styles.css`; its inline styles consume `var(--na-*)`.
