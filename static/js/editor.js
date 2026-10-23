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

    // ---------------------------------------------------------------------
    // Basic formatting toolbar
    //
    // The toolbar only changes the textarea value. Nothing is saved until the
    // form is submitted (Update / Publish), just like the font preview.
    // ---------------------------------------------------------------------
    const toolbar = document.querySelector('[data-format-toolbar]');

    if (toolbar && textarea) {
        let savedSelection = {
            start: textarea.selectionStart,
            end: textarea.selectionEnd,
        };

        function rememberSelection() {
            savedSelection = {
                start: textarea.selectionStart,
                end: textarea.selectionEnd,
            };
        }

        function restoreSelection() {
            const length = textarea.value.length;
            const start = Math.min(savedSelection.start, length);
            const end = Math.min(savedSelection.end, length);
            textarea.focus({ preventScroll: true });
            textarea.setSelectionRange(start, end);
        }

        function setSelection(start, end) {
            textarea.focus({ preventScroll: true });
            textarea.setSelectionRange(start, end);
            savedSelection = { start: start, end: end };
        }

        function notifyChange() {
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }

        function replaceRange(start, end, text, selectionStart, selectionEnd) {
            textarea.setRangeText(text, start, end, 'end');
            setSelection(selectionStart, selectionEnd);
            notifyChange();
        }

        // The line(s) touched by the current selection, without the trailing
        // newline. Heading and list actions work a whole line at a time.
        function getBlock() {
            const value = textarea.value;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const blockStart = value.lastIndexOf('\n', start - 1) + 1;
            let blockEnd;

            if (end > start) {
                blockEnd = value.indexOf('\n', end - 1);
            } else {
                blockEnd = value.indexOf('\n', start);
            }
            if (blockEnd === -1) blockEnd = value.length;

            return {
                value: value,
                start: start,
                end: end,
                blockStart: blockStart,
                blockEnd: blockEnd,
                text: value.slice(blockStart, blockEnd),
            };
        }

        function replaceBlock(block, newText) {
            textarea.setRangeText(newText, block.blockStart, block.blockEnd, 'end');

            if (block.start === block.end) {
                const cursor = block.blockStart + newText.length;
                setSelection(cursor, cursor);
            } else {
                setSelection(block.blockStart, block.blockStart + newText.length);
            }
            notifyChange();
        }

        function toggleInline(open, close) {
            const value = textarea.value;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const selected = value.slice(start, end);

            // Only treat a marker as "already applied" when it is not part of
            // a longer run (so **bold** does not look like _italic_ etc.).
            function startsWithExactMarker(text, marker) {
                return text.slice(0, marker.length) === marker &&
                    text[marker.length] !== marker[0];
            }

            function endsWithExactMarker(text, marker) {
                return text.slice(-marker.length) === marker &&
                    text[text.length - marker.length - 1] !== marker[0];
            }

            // The selection itself contains the markers: unwrap it.
            if (selected.length >= open.length + close.length &&
                startsWithExactMarker(selected, open) &&
                endsWithExactMarker(selected, close)) {
                const inner = selected.slice(open.length, selected.length - close.length);
                replaceRange(start, end, inner, start, start + inner.length);
                return;
            }

            // The markers sit immediately around the selection: unwrap them.
            const before = value.slice(Math.max(0, start - open.length), start);
            const after = value.slice(end, end + close.length);
            const beforeIsExact = before === open &&
                (start - open.length === 0 || value[start - open.length - 1] !== open[0]);
            const afterIsExact = after === close &&
                (end + close.length >= value.length || value[end + close.length] !== close[0]);

            if (beforeIsExact && afterIsExact) {
                replaceRange(
                    start - open.length,
                    end + close.length,
                    selected,
                    start - open.length,
                    end - open.length
                );
                return;
            }

            // No selection: insert the pair and place the cursor between it.
            if (start === end) {
                replaceRange(start, end, open + close, start + open.length, start + open.length);
                return;
            }

            const wrapped = open + selected + close;
            replaceRange(start, end, wrapped, start + open.length, end + open.length);
        }

        function toggleAsterisks(style) {
            const value = textarea.value;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const selected = value.slice(start, end);
            const markerCount = style === 'bold' ? 2 : 1;

            function leadingStars(text) {
                let count = 0;
                while (text[count] === '*') count += 1;
                return count;
            }

            function trailingStars(text) {
                let count = 0;
                let index = text.length - 1;
                while (index >= 0 && text[index] === '*') {
                    count += 1;
                    index -= 1;
                }
                return count;
            }

            // If the selection itself includes the asterisks, unwrap the
            // requested style while preserving the other one.
            const leading = leadingStars(selected);
            const trailing = trailingStars(selected);
            if (selected.length > 0 && leading > 0 && trailing > 0) {
                if (style === 'bold' && leading >= 2 && trailing >= 2) {
                    const inner = selected.slice(2, selected.length - 2);
                    replaceRange(start, end, inner, start, start + inner.length);
                    return;
                }
                if (style === 'italic' && leading % 2 === 1 && trailing % 2 === 1) {
                    const inner = selected.slice(1, selected.length - 1);
                    replaceRange(start, end, inner, start, start + inner.length);
                    return;
                }
            }

            // Count the asterisk runs immediately outside the selection.
            let beforeCount = 0;
            let beforeIndex = start - 1;
            while (beforeIndex >= 0 && value[beforeIndex] === '*') {
                beforeCount += 1;
                beforeIndex -= 1;
            }

            let afterCount = 0;
            let afterIndex = end;
            while (afterIndex < value.length && value[afterIndex] === '*') {
                afterCount += 1;
                afterIndex += 1;
            }

            function addMarkers() {
                const markers = '*'.repeat(markerCount);
                const wrapped = markers + selected + markers;
                replaceRange(start, end, wrapped, start + markerCount, end + markerCount);
            }

            if (style === 'bold') {
                if (beforeCount >= 2 && afterCount >= 2) {
                    replaceRange(start - 2, end + 2, selected, start - 2, end - 2);
                    return;
                }
                addMarkers();
                return;
            }

            if (beforeCount > 0 && afterCount > 0 &&
                beforeCount % 2 === 1 && afterCount % 2 === 1) {
                replaceRange(start - 1, end + 1, selected, start - 1, end - 1);
                return;
            }
            addMarkers();
        }

        function applyHeading(level) {
            const block = getBlock();
            const lines = block.text.split('\n');
            const nonEmpty = lines.filter(function(line) {
                return line.trim() !== '';
            });
            const onlyEmptyLine = lines.length === 1 && nonEmpty.length === 0;

            if (nonEmpty.length === 0 && !onlyEmptyLine) return;

            const headingPattern = /^(\s*)(#{1,6})\s+(.*)$/;
            const allTarget = nonEmpty.length > 0 && nonEmpty.every(function(line) {
                const match = line.match(headingPattern);
                return match && match[2].length === level;
            });

            function rewrite(line) {
                const match = line.match(headingPattern);
                let indent;
                let content;

                if (match) {
                    indent = match[1];
                    content = match[3];
                } else {
                    const plain = line.match(/^(\s*)(.*)$/);
                    indent = plain[1];
                    content = plain[2];
                }

                return allTarget
                    ? indent + content
                    : indent + '#'.repeat(level) + ' ' + content;
            }

            const newLines = lines.map(function(line) {
                if (line.trim() === '' && !onlyEmptyLine) return line;
                return rewrite(line);
            });
            replaceBlock(block, newLines.join('\n'));
        }

        function applyList(type) {
            const block = getBlock();
            const lines = block.text.split('\n');
            const nonEmpty = lines.filter(function(line) {
                return line.trim() !== '';
            });
            const onlyEmptyLine = lines.length === 1 && nonEmpty.length === 0;

            if (nonEmpty.length === 0 && !onlyEmptyLine) return;

            const unorderedPattern = /^\s*[-*+]\s+/;
            const orderedPattern = /^\s*\d+[.)]\s+/;
            const targetPattern = type === 'ul' ? unorderedPattern : orderedPattern;
            const allTarget = nonEmpty.length > 0 && nonEmpty.every(function(line) {
                return targetPattern.test(line);
            });

            let number = 0;
            const newLines = lines.map(function(line) {
                if (line.trim() === '' && !onlyEmptyLine) return line;

                const parts = line.match(/^(\s*)(.*)$/);
                const indent = parts[1];
                const content = parts[2].replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, '');

                if (allTarget) return indent + content;

                number += 1;
                if (type === 'ul') return indent + '- ' + content;
                return indent + number + '. ' + content;
            });
            replaceBlock(block, newLines.join('\n'));
        }

        function insertLink() {
            const value = textarea.value;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const selected = value.slice(start, end);
            const label = selected || 'text';
            const inserted = '[' + label + '](url)';

            if (selected) {
                // Select the placeholder URL so it can be typed or pasted.
                const urlStart = start + label.length + 3;
                replaceRange(start, end, inserted, urlStart, urlStart + 3);
            } else {
                // Select the placeholder label so it can be typed over.
                replaceRange(start, end, inserted, start + 1, start + 1 + label.length);
            }
        }

        const actions = {
            bold: function() { toggleAsterisks('bold'); },
            italic: function() { toggleAsterisks('italic'); },
            underline: function() { toggleInline('<u>', '</u>'); },
            ul: function() { applyList('ul'); },
            ol: function() { applyList('ol'); },
            link: insertLink,
        };

        [1, 2, 3, 4, 5, 6].forEach(function(level) {
            actions['h' + level] = function() { applyHeading(level); };
        });

        // Remember the textarea selection before a toolbar button can take
        // focus away from it, including on touch screens.
        ['keyup', 'mouseup', 'input'].forEach(function(eventName) {
            textarea.addEventListener(eventName, rememberSelection);
        });
        if (window.PointerEvent) {
            toolbar.addEventListener('pointerdown', rememberSelection);
        } else {
            toolbar.addEventListener('mousedown', rememberSelection);
            toolbar.addEventListener('touchstart', rememberSelection, { passive: true });
        }

        toolbar.addEventListener('click', function(event) {
            const button = event.target.closest('button[data-format]');
            if (!button) return;

            const action = actions[button.dataset.format];
            if (!action) return;

            event.preventDefault();
            restoreSelection();
            action();
        });
    }
});
