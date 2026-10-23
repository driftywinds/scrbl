document.addEventListener('DOMContentLoaded', function() {
    const textarea = document.querySelector('textarea[name="content"]');
    const form = document.querySelector('[data-editor-form]');
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
    }

    // Form submission validation
    if (form && textarea) {
        form.addEventListener('submit', function(e) {
            if (textarea.value.length > MAX_LENGTH) {
                e.preventDefault();
                alert(`Content is too long! Please reduce it under ${MAX_LENGTH} characters. Current: ${textarea.value.length}`);
            }
        });
    }

    // Initialize on load
    if (textarea) {
        autoGrow(textarea);
    }

    // Tailwind's CDN styles can land after DOMContentLoaded, and the editor
    // reflows at the lg breakpoint. Re-measure so the textarea keeps its full
    // content height in both the stacked and side-by-side layouts.
    let resizeTimer = null;
    function refreshTextareaHeight() {
        if (!textarea) return;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
            autoGrow(textarea);
        }, 100);
    }
    window.addEventListener('load', refreshTextareaHeight);
    window.addEventListener('resize', refreshTextareaHeight);

    // ---------------------------------------------------------------------
    // Live preview
    //
    // The preview pane shows the rendered article (the same markdown pipeline
    // as the published note page), so the chosen font is demonstrated on real
    // headings and paragraphs rather than on raw markdown. Nothing is
    // persisted here: the font is only saved when Update / Publish is clicked.
    // ---------------------------------------------------------------------
    const fontSelect = document.getElementById('font');
    const previewPane = document.querySelector('[data-font-preview-pane]');
    const previewUrl = form ? form.dataset.previewUrl : null;
    const titleInput = document.querySelector('input[name="title"]');
    const authorInput = document.querySelector('input[name="author"]');

    const loadedFonts = new Set();
    let previewTimer = null;
    let previewSeq = 0;

    function loadFont(family) {
        if (!family || loadedFonts.has(family)) return;
        loadedFonts.add(family);
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=' + family + '&display=swap';
        document.head.appendChild(link);
    }

    function applySelectedFont() {
        if (!fontSelect || !previewPane) return;
        const option = fontSelect.options[fontSelect.selectedIndex];
        if (!option) return;

        loadFont(option.dataset.googleFamily);
        if (option.dataset.stack) {
            previewPane.style.fontFamily = option.dataset.stack;
        }
    }

    function previewIsEmpty() {
        const content = textarea ? textarea.value.trim() : '';
        const title = titleInput ? titleInput.value.trim() : '';
        const author = authorInput ? authorInput.value.trim() : '';
        return !content && !title && !author;
    }

    function showPlaceholder() {
        if (!previewPane) return;
        previewPane.innerHTML = '<p class="text-gray-300 text-sm" data-preview-placeholder>Start typing to see the article preview.</p>';
    }

    function renderPreview() {
        if (!previewPane || !previewUrl || !textarea) return;

        if (previewIsEmpty()) {
            previewSeq += 1;
            showPlaceholder();
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
            .then(function(response) {
                if (!response.ok) throw new Error('Preview request failed');
                return response.json();
            })
            .then(function(data) {
                // Ignore stale responses and keep the last good preview on errors.
                if (seq !== previewSeq || !data || !data.ok) return;
                previewPane.innerHTML = data.html || '';
                applySelectedFont();
            })
            .catch(function() {
                // Keep the last good preview on a transient failure.
            });
    }

    function schedulePreview() {
        if (!previewPane || !previewUrl) return;
        clearTimeout(previewTimer);
        previewTimer = setTimeout(renderPreview, 250);
    }

    if (fontSelect) {
        fontSelect.addEventListener('change', applySelectedFont);
    }
    if (textarea) {
        textarea.addEventListener('input', schedulePreview);
    }
    if (titleInput) {
        titleInput.addEventListener('input', schedulePreview);
    }
    if (authorInput) {
        authorInput.addEventListener('input', schedulePreview);
    }

    // Paint the preview in the note's currently selected font on load.
    applySelectedFont();
    renderPreview();
});
