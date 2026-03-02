type SnapshotResponse = {
    targetUrl?: string;
    rawUrl?: string;
    statusMessage?: string;
    errorMessage?: string;
    htmlPieces?: string[];
};

declare global {
    interface Window {
        snapshotApi?: {
            loadSnapshot: (url: string) => Promise<SnapshotResponse>;
        };
    }
}

const DEFAULT_STATUS = '';

const form = document.getElementById('url-form') as HTMLFormElement | null;
const input = document.getElementById('url-input') as HTMLInputElement | null;
const backButton = document.getElementById('back-button') as HTMLButtonElement | null;
const forwardButton = document.getElementById('forward-button') as HTMLButtonElement | null;
const reloadButton = document.getElementById('reload-button') as HTMLButtonElement | null;
const tabsEl = document.getElementById('tabs') as HTMLDivElement | null;
const errorEl = document.getElementById('error') as HTMLDivElement | null;
const contentEl = document.getElementById('content') as HTMLElement | null;

type Tab = {
    id: number;
    title: string;
    inputValue: string;
    statusMessage: string;
    errorMessage: string;
    history: SnapshotResponse[];
    historyIndex: number;
    loading: boolean;
    requestToken: number;
};

let nextTabId = 1;
const tabs: Tab[] = [];
let activeTabId: number | null = null;

function applySystemThemePreference(): void {
    const root = document.documentElement;
    const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const syncTheme = (event?: MediaQueryList | MediaQueryListEvent): void => {
        const prefersDark = event ? event.matches : colorSchemeQuery.matches;
        root.classList.toggle('dark', prefersDark);
    };

    syncTheme(colorSchemeQuery);

    if (typeof colorSchemeQuery.addEventListener === 'function') {
        colorSchemeQuery.addEventListener('change', syncTheme);
    } else if (typeof colorSchemeQuery.addListener === 'function') {
        colorSchemeQuery.addListener(syncTheme);
    }
}

function escapeHtml(value: string): string {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function shorten(value: string, maxLength = 28): string {
    if (!value || value.length <= maxLength) return value;
    return `${value.slice(0, maxLength - 3)}...`;
}

function deriveTitleFromEntry(entry: SnapshotResponse | null): string {
    if (entry?.targetUrl) {
        try {
            const parsed = new URL(entry.targetUrl);
            const path = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '';
            return shorten(`${parsed.hostname}${path}`);
        } catch {
            return shorten(entry.targetUrl);
        }
    }

    if (entry?.rawUrl?.trim()) {
        return shorten(entry.rawUrl.trim());
    }

    if (entry?.errorMessage) {
        return 'Load error';
    }

    return 'New Tab';
}

function renderContent(htmlPieces: string[] | undefined): void {
    if (!contentEl) return;

    if (!Array.isArray(htmlPieces) || htmlPieces.length === 0) {
        contentEl.innerHTML = '<div class="w-full rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">No snapshot yet.</div>';
        return;
    }

    contentEl.innerHTML = htmlPieces.join('\n');
}

function getTabById(tabId: number): Tab | null {
    return tabs.find((tab) => tab.id === tabId) || null;
}

function getActiveTab(): Tab | null {
    if (activeTabId === null) return null;
    return getTabById(activeTabId);
}

function getCurrentEntry(tab: Tab | null): SnapshotResponse | null {
    if (!tab || tab.historyIndex < 0 || tab.historyIndex >= tab.history.length) return null;
    return tab.history[tab.historyIndex] || null;
}

function applyEntryToTab(tab: Tab, entry: SnapshotResponse | null): void {
    tab.statusMessage = entry?.statusMessage || DEFAULT_STATUS;
    tab.errorMessage = entry?.errorMessage || '';
    tab.inputValue = entry?.targetUrl || entry?.rawUrl || tab.inputValue;
    tab.title = deriveTitleFromEntry(entry);
}

function renderTabs(): void {
    if (!tabsEl) return;

    const tabsHtml = tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const rootClass = isActive ? 'chrome-tab is-active' : 'chrome-tab';

        return `
            <div class="${rootClass}">
                <button type="button" data-action="activate" data-tab-id="${tab.id}" class="chrome-tab-title">${escapeHtml(tab.title)}</button>
                <button type="button" data-action="close" data-tab-id="${tab.id}" class="chrome-tab-close" aria-label="Close tab">×</button>
            </div>
        `;
    }).join('');

    tabsEl.innerHTML = `${tabsHtml}<button id="new-tab-button" type="button" class="chrome-new-tab" aria-label="New tab">+</button>`;
    tabsEl.querySelector('#new-tab-button')?.addEventListener('click', () => {
        createTab();
    });
}

function renderActiveTab(): void {
    if (!input || !errorEl || !backButton || !forwardButton || !reloadButton) return;

    if (tabs.length === 0) {
        renderContent([]);
        errorEl.hidden = true;
        return;
    }

    if (!getActiveTab()) {
        activeTabId = tabs[0].id;
    }

    const tab = getActiveTab();
    if (!tab) return;

    const entry = getCurrentEntry(tab);

    renderTabs();

    input.value = tab.inputValue || '';
    if (tab.errorMessage) {
        errorEl.hidden = false;
        errorEl.innerHTML = escapeHtml(tab.errorMessage);
    } else {
        errorEl.hidden = true;
        errorEl.textContent = '';
    }

    renderContent(entry?.htmlPieces);

    backButton.disabled = tab.loading || tab.historyIndex <= 0;
    forwardButton.disabled = tab.loading || tab.historyIndex < 0 || tab.historyIndex >= tab.history.length - 1;
    reloadButton.disabled = tab.loading;
    if (tab.loading) {
        reloadButton.setAttribute('aria-label', 'Loading');
        reloadButton.title = 'Loading';
        reloadButton.innerHTML = '<span class="chrome-spinner" aria-hidden="true"></span>';
    } else {
        reloadButton.setAttribute('aria-label', 'Reload');
        reloadButton.title = 'Reload';
        reloadButton.textContent = '↻';
    }
}

function createTab(initialUrl = ''): void {
    const tab: Tab = {
        id: nextTabId,
        title: 'New Tab',
        inputValue: initialUrl,
        statusMessage: DEFAULT_STATUS,
        errorMessage: '',
        history: [],
        historyIndex: -1,
        loading: false,
        requestToken: 0
    };

    nextTabId += 1;
    tabs.push(tab);
    activeTabId = tab.id;
    renderActiveTab();

    if (initialUrl) {
        void loadSnapshotForTab(tab, initialUrl);
    }
}

function closeTab(tabId: number): void {
    const index = tabs.findIndex((tab) => tab.id === tabId);
    if (index === -1) return;

    const wasActive = activeTabId === tabId;
    tabs.splice(index, 1);

    if (tabs.length === 0) {
        createTab();
        return;
    }

    if (wasActive) {
        const nextIndex = Math.max(0, index - 1);
        activeTabId = tabs[nextIndex].id;
    }

    renderActiveTab();
}

function pushHistoryEntry(tab: Tab, entry: SnapshotResponse): void {
    if (tab.historyIndex < tab.history.length - 1) {
        tab.history = tab.history.slice(0, tab.historyIndex + 1);
    }

    tab.history.push(entry);
    tab.historyIndex = tab.history.length - 1;
    applyEntryToTab(tab, entry);
}

async function loadSnapshotForTab(tab: Tab, rawUrl: string): Promise<void> {
    const requestToken = tab.requestToken + 1;
    tab.requestToken = requestToken;
    tab.loading = true;
    tab.statusMessage = 'Loading snapshot...';
    tab.errorMessage = '';
    tab.inputValue = rawUrl;
    renderActiveTab();

    try {
        if (!window.snapshotApi || typeof window.snapshotApi.loadSnapshot !== 'function') {
            throw new Error('Snapshot API bridge is unavailable. Restart the app.');
        }

        const response = await window.snapshotApi.loadSnapshot(rawUrl);
        if (!getTabById(tab.id) || tab.requestToken !== requestToken) return;

        pushHistoryEntry(tab, response);
    } catch (error) {
        if (!getTabById(tab.id) || tab.requestToken !== requestToken) return;

        const message = error instanceof Error ? error.message : String(error);
        pushHistoryEntry(tab, {
            rawUrl,
            statusMessage: 'Failed to load snapshot.',
            errorMessage: message,
            htmlPieces: []
        });
    } finally {
        if (!getTabById(tab.id) || tab.requestToken !== requestToken) return;
        tab.loading = false;
        renderActiveTab();
    }
}

function goBack(): void {
    const tab = getActiveTab();
    if (!tab || tab.loading || tab.historyIndex <= 0) return;

    tab.historyIndex -= 1;
    applyEntryToTab(tab, getCurrentEntry(tab));
    renderActiveTab();
}

function goForward(): void {
    const tab = getActiveTab();
    if (!tab || tab.loading || tab.historyIndex >= tab.history.length - 1) return;

    tab.historyIndex += 1;
    applyEntryToTab(tab, getCurrentEntry(tab));
    renderActiveTab();
}

function reloadCurrent(): void {
    const tab = getActiveTab();
    if (!tab || tab.loading) return;

    const entry = getCurrentEntry(tab);
    const urlToReload = entry?.targetUrl || entry?.rawUrl || tab.inputValue || '';
    if (!urlToReload.trim()) return;

    void loadSnapshotForTab(tab, urlToReload);
}

function init(): void {
    applySystemThemePreference();

    if (!form || !input || !tabsEl || !backButton || !forwardButton || !reloadButton) {
        throw new Error('Required renderer elements are missing from index.html');
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const tab = getActiveTab();
        if (!tab) return;

        void loadSnapshotForTab(tab, input.value || '');
    });

    input.addEventListener('input', () => {
        const tab = getActiveTab();
        if (!tab) return;
        tab.inputValue = input.value || '';
    });

    tabsEl.addEventListener('click', (event) => {
        const target = (event.target as Element | null)?.closest('button[data-action]');
        if (!target) return;

        const tabId = Number(target.getAttribute('data-tab-id'));
        if (!Number.isFinite(tabId)) return;

        const action = target.getAttribute('data-action');
        if (action === 'activate') {
            activeTabId = tabId;
            renderActiveTab();
            return;
        }

        if (action === 'close') {
            closeTab(tabId);
        }
    });

    backButton.addEventListener('click', goBack);
    forwardButton.addEventListener('click', goForward);
    reloadButton.addEventListener('click', reloadCurrent);

    createTab();
}

init();

export {};
