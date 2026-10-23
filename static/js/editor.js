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

    // Live font preview: changing the dropdown restyles the editor immediately.
    // Nothing is persisted here; the choice is only saved by the form submit.
    const fontSelect = document.getElementById('font');
    const previewTarget = document.querySelector('[data-font-preview]');

    if (fontSelect && previewTarget) {
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
            const option = fontSelect.options[fontSelect.selectedIndex];
            if (!option) return;

            loadFont(option.dataset.googleFamily);

            const stack = option.dataset.stack;
            if (stack) previewTarget.style.fontFamily = stack;
        }

        fontSelect.addEventListener('change', applySelectedFont);
        applySelectedFont();
    }
}); 