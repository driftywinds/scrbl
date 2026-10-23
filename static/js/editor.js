document.addEventListener('DOMContentLoaded', function() {
    const textarea = document.querySelector('textarea[name="content"]');
    const form = document.querySelector('form');
    const MAX_LENGTH = 200000; // 200k characters limit

    if (textarea) {
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

        // Add input listener
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
    // Live preview
    //
    // The preview pane renders the real article markup (same pipeline as the
    // published note page) so the font choice is shown on formatted text, not
    // on raw markdown. Nothing here is persisted: the font is only saved when
    // the form is submitted.
    // ---------------------------------------------------------------------
    const fontSelect = document.getElementById('font');
    const editorForm = document.querySelector('[data-font-preview]');
    const previewPane = document.querySelector('[data-font-preview-pane]');
    const titleInput = document.querySelector('input[name="title"]');
    const authorInput = document.querySelector('input[name="author"]');

    const loadedFonts = new Set();

    function loadFont(family) {
        if (!family || loadedFonts.has(family)) return;
        loadedFonts.add(family);
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=' + family + '&display=swap';
        document.head.appendChild(link);
    }

    function selectedStack() {
        if (!fontSelect) return null;
        const option = fontSelect.options[fontSelect.selectedIndex];
        if (!option) return null;
        loadFont(option.dataset.googleFamily);
        return option.dataset.stack || null;
    }

    function applySelectedFont() {
        const stack = selectedStack();
        if (!stack) return;
        // The pane is the formatted article; the form makes the textarea match.
        if (previewPane) previewPane.style.fontFamily = stack;
        if (editorForm) editorForm.style.fontFamily = stack;
    }

    const previewUrl = editorForm ? editorForm.dataset.previewUrl : null;
    let previewTimer = null;

    function renderPreview() {
        if (!previewPane || !previewUrl || !textarea) return;

        const content = textarea.value;

        if (!content.trim()) {
            previewPane.innerHTML = '<p class="text-gray-300 text-sm">Start typing to see the article preview.</p>';
            return;
        }

        const body = new URLSearchParams({
            content: content,
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
                if (data && data.ok) {
                    previewPane.innerHTML = data.html || '';
                    applySelectedFont();
                }
            })
            .catch(function () {
                // Keep the last good preview on a transient failure.
            });
    }

    function schedulePreview() {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(renderPreview, 350);
    }

    if (fontSelect) {
        fontSelect.addEventListener('change', applySelectedFont);
    }

    if (textarea) {
        textarea.addEventListener('input', schedulePreview);
    }
    [titleInput, authorInput].forEach(function (input) {
        if (input) input.addEventListener('input', schedulePreview);
    });

    applySelectedFont();
    renderPreview();
});