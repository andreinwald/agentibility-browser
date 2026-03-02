import type { SnapshotResponse } from '../../shared/snapshot.js';
import type { LoadMode, Tab } from '../types.js';

const DEFAULT_STATUS = '';

function shorten(value: string, maxLength = 28): string {
    if (!value || value.length <= maxLength) return value;
    return `${value.slice(0, maxLength - 3)}...`;
}

export function deriveTitleFromEntry(entry: SnapshotResponse | null): string {
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

export function getCurrentEntry(tab: Tab | null): SnapshotResponse | null {
    if (!tab || tab.historyIndex < 0 || tab.historyIndex >= tab.history.length) return null;
    return tab.history[tab.historyIndex] || null;
}

export function applyEntryToTab(tab: Tab, entry: SnapshotResponse | null, options?: { updateInput?: boolean }): Tab {
    const updateInput = options?.updateInput ?? true;

    return {
        ...tab,
        statusMessage: entry?.statusMessage || DEFAULT_STATUS,
        errorMessage: entry?.errorMessage || '',
        inputValue: updateInput ? entry?.targetUrl || entry?.rawUrl || tab.inputValue : tab.inputValue,
        title: deriveTitleFromEntry(entry),
        sessionId: entry?.sessionId || tab.sessionId
    };
}

export function createEmptyTab(id: number, initialUrl = ''): Tab {
    return {
        id,
        title: 'New Tab',
        inputValue: initialUrl,
        statusMessage: DEFAULT_STATUS,
        errorMessage: '',
        history: [],
        historyIndex: -1,
        loading: false,
        refreshing: false,
        requestToken: 0,
        sessionId: undefined
    };
}

export function upsertHistoryEntry(tab: Tab, entry: SnapshotResponse, mode: LoadMode): Tab {
    if (mode === 'navigate') {
        const baseHistory = tab.historyIndex < tab.history.length - 1
            ? tab.history.slice(0, tab.historyIndex + 1)
            : tab.history;

        const history = [...baseHistory, entry];
        const historyIndex = history.length - 1;

        return applyEntryToTab({ ...tab, history, historyIndex }, entry, { updateInput: true });
    }

    if (tab.historyIndex < 0 || tab.historyIndex >= tab.history.length) {
        const history = [...tab.history, entry];
        const historyIndex = history.length - 1;

        return applyEntryToTab({ ...tab, history, historyIndex }, entry, { updateInput: false });
    }

    const history = tab.history.slice();
    const currentEntry = history[tab.historyIndex] || {};
    history[tab.historyIndex] = {
        ...currentEntry,
        ...entry,
        rawUrl: currentEntry.rawUrl || entry.rawUrl
    };

    return applyEntryToTab({ ...tab, history }, history[tab.historyIndex], { updateInput: false });
}
