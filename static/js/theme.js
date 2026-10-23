(function () {
    const STORAGE_KEY = 'scrbl-theme';
    const root = document.documentElement;

    function isDark() {
        return root.classList.contains('dark');
    }

    function syncToggles() {
        const dark = isDark();
        const label = dark ? 'Switch to light mode' : 'Switch to dark mode';

        document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
            button.setAttribute('aria-label', label);
            button.setAttribute('title', label);
        });
    }

    function applyTheme(theme) {
        root.classList.toggle('dark', theme === 'dark');
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch (error) {
            // Storage can be unavailable in private browsing; the page still toggles.
        }
        syncToggles();
    }

    document.addEventListener('click', function (event) {
        const button = event.target.closest('[data-theme-toggle]');
        if (!button) return;

        event.preventDefault();
        applyTheme(isDark() ? 'light' : 'dark');
    });

    window.addEventListener('storage', function (event) {
        if (event.key !== STORAGE_KEY) return;
        root.classList.toggle('dark', event.newValue === 'dark');
        syncToggles();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', syncToggles);
    } else {
        syncToggles();
    }
})();
