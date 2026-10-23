document.addEventListener('DOMContentLoaded', function() {
    const textarea = document.querySelector('textarea[name="content"]');
    const form = document.querySelector('form');
    const MAX_LENGTH = 200000; // 200k characters limit

    // Auto-grow function
    function autoGrow(elem) {
        // Store current scroll position
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        elem.style.height = 'auto';
        elem.style.height = (elem.scrollHeight) + 'px';

        // Restore scroll position
        window.scrollTo(scrollLeft, scrollTop);
    }

    if (textarea) {
        textarea.addEventListener('input', function() {
            autoGrow(textarea);
        });

        // Form submission validation
        if (form) {
            form.addEventListener('submit', function(e) {
                if (textarea.value.length > MAX_LENGTH) {
                    e.preventDefault();
                    alert(`Content is too long! Please reduce it to under ${MAX_LENGTH} characters. Current: ${textarea.value.length}`);
                }
            });
        }

        // Initialize on load
        autoGrow(textarea);
    }

    // ---------------------------------------------------------------------
    // Write / Preview + live font preview
    //
    // "Preview" shows the real rendered article (same markdown pipeline as the
    // published note page, so headings are headings, not "#" characters) in the
    // currently selected font. Picking a font switches to the preview right
    // away so the effect is visible. Nothing here is persisted: the font is
    // only saved when the form is submitted (Update / Publish).
    // ---------------------------------------------------------------------
    const fontSelect = document.getElementById('font');
    const editorForm = document.querySelector('[data-font-preview]');
    const writePane = document.querySelector('[data-write-pane]');
    const previewWrap = document.querySelector('[data-preview-wrap]');
    const previewPane = document.querySelector('[data-font-preview-pane]');
    const modeHint = document.querySelector('[data-mode-hint]');
    const modeTabs = document.querySelectorAll('[data-mode-tab]');
    const titleInput = document.querySelector('input[name="title"]');
    const authorInput = document.querySelector('input[name="author"]');
    const previewUrl = editorForm ? editorForm.dataset.previewUrl : null;
    const EMPTY_HTML = '<p class="text-gray-300 text-sm">Start typing to see the article preview.</p>';

    let mode = 'write';
    let previewSeq = 0;
    const loadedFonts = new Set();

    function loadFont(family) {
        if (!family || loadedFonts.has(family)) return;
        loadedFonts.add(family);
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=' + family + '&display=swap';
        document.head.appendChild(link);
    }

    function applySelectedFont() {
        if (!fontSelect) return;
        const option = fontSelect.options[fontSelect.selectedIndex];
        if (!option) return;
        loadFont(option.dataset.googleFamily);
        const stack = option.dataset.stack;
        if (!stack) return;
        // Only the writing/reading areas change; the controls keep the UI font.
        if (writePane) writePane.style.fontFamily = stack;
        if (previewWrap) previewWrap.style.fontFamily = stack;
    }

    function renderPreview() {
        if (!previewPane || !previewUrl || !textarea) return;

        if (!textarea.value.trim()) {
            previewPane.innerHTML = EMPTY_HTML;
            return;
        }

        const seq = ++previewSeq;
        const body = new URLSearchParams({
            content: textarea.value,
            title: titleInput ? titleInput.value : '',
            author: authorInput ? authorInput.value : '',
        });

        fetch(previewUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        })
            .then(function (response) { return response.json(); })
            .then(function (data) {
                // Ignore stale responses and keep the last good preview on errors.
                if (seq !== previewSeq || !data || !data.ok) return;
                previewPane.innerHTML = data.html || EMPTY_HTML;
            })
            .catch(function () {});
    }

    function setMode(next) {
        mode = next;
        const preview = next === 'preview';
        if (writePane) writePane.hidden = preview;
        if (previewWrap) previewWrap.hidden = !preview;
        modeTabs.forEach(function (tab) {
            tab.setAttribute('aria-selected', String(tab.dataset.modeTab === next));
        });
        if (modeHint) modeHint.textContent = preview ? 'Article preview' : 'Markdown source';
        if (preview) {
            renderPreview();
        } else if (textarea) {
            autoGrow(textarea);
        }
    }

    modeTabs.forEach(function (tab) {
        tab.addEventListener('click', function () { setMode(tab.dataset.modeTab); });
    });

    if (fontSelect) {
        fontSelect.addEventListener('change', function () {
            applySelectedFont();
            // Show the formatted article so the new font is actually visible.
            if (mode !== 'preview') setMode('preview');
        });
    }

    applySelectedFont();
});