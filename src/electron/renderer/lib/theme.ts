export function applySystemThemePreference(): () => void {
    const root = document.documentElement;
    const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const syncTheme = (event?: MediaQueryList | MediaQueryListEvent): void => {
        const prefersDark = event ? event.matches : colorSchemeQuery.matches;
        root.classList.toggle('dark', prefersDark);
    };

    syncTheme(colorSchemeQuery);

    if (typeof colorSchemeQuery.addEventListener === 'function') {
        colorSchemeQuery.addEventListener('change', syncTheme);
        return () => {
            colorSchemeQuery.removeEventListener('change', syncTheme);
        };
    }

    colorSchemeQuery.addListener(syncTheme);
    return () => {
        colorSchemeQuery.removeListener(syncTheme);
    };
}
