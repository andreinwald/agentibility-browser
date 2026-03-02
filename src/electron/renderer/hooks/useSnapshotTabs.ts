import type { McpCommand, SnapshotResponse } from '../../shared/snapshot.js';
import { applySystemThemePreference } from '../lib/theme.js';
import { applyEntryToTab, createEmptyTab, getCurrentEntry, upsertHistoryEntry } from '../lib/tabState.js';
import type { LoadMode, Tab } from '../types.js';

declare const React: typeof import('react');

type SnapshotTabsController = {
    tabs: Tab[];
    activeTab: Tab | null;
    activeEntry: SnapshotResponse | null;
    isLoading: boolean;
    activateTab: (tabId: number) => void;
    createTab: (initialUrl?: string) => void;
    closeTab: (tabId: number) => void;
    submitActiveTab: (event: React.FormEvent<HTMLFormElement>) => void;
    updateActiveInput: (event: React.ChangeEvent<HTMLInputElement>) => void;
    goBack: () => void;
    goForward: () => void;
    reloadCurrent: () => void;
    executeMcpCommand: (command: McpCommand) => Promise<void>;
};

function getEntryUrl(entry: SnapshotResponse | null): string {
    return entry?.targetUrl || entry?.rawUrl || '';
}

function shouldCreateHistoryEntryForCommand(command: McpCommand, previousEntry: SnapshotResponse | null, response: SnapshotResponse): boolean {
    if (command.action === 'open') {
        return true;
    }

    const previousUrl = getEntryUrl(previousEntry);
    const nextUrl = getEntryUrl(response);
    if (!previousUrl || !nextUrl) {
        return false;
    }

    return previousUrl !== nextUrl;
}

export function useSnapshotTabs(): SnapshotTabsController {
    const [tabs, setTabs] = React.useState<Tab[]>([]);
    const [activeTabId, setActiveTabId] = React.useState<number | null>(null);

    const nextTabIdRef = React.useRef(1);
    const tabsRef = React.useRef<Tab[]>(tabs);
    const activeTabIdRef = React.useRef<number | null>(activeTabId);

    React.useEffect(() => {
        tabsRef.current = tabs;
    }, [tabs]);

    React.useEffect(() => {
        activeTabIdRef.current = activeTabId;
    }, [activeTabId]);

    React.useEffect(() => {
        return applySystemThemePreference();
    }, []);

    const getTabById = React.useCallback((tabId: number): Tab | null => {
        return tabsRef.current.find((tab) => tab.id === tabId) || null;
    }, []);

    const loadSnapshotForTab = React.useCallback(async (tabId: number, rawUrl: string, mode: LoadMode): Promise<void> => {
        const tab = getTabById(tabId);
        if (!tab) return;

        const requestToken = tab.requestToken + 1;

        setTabs((previousTabs) => previousTabs.map((candidate) => {
            if (candidate.id !== tabId) return candidate;

            return {
                ...candidate,
                requestToken,
                loading: mode === 'navigate',
                refreshing: mode === 'refresh',
                statusMessage: mode === 'navigate' ? 'Loading snapshot...' : candidate.statusMessage,
                errorMessage: '',
                inputValue: mode === 'navigate' ? rawUrl : candidate.inputValue
            };
        }));

        try {
            if (!window.snapshotApi) {
                throw new Error('Snapshot API bridge is unavailable. Restart the app.');
            }

            let response: SnapshotResponse;
            if (mode === 'navigate') {
                response = await window.snapshotApi.loadSnapshot(rawUrl, tab.sessionId);
            } else {
                if (!tab.sessionId) {
                    throw new Error('No snapshot session available for this tab.');
                }
                response = await window.snapshotApi.refreshSnapshot(tab.sessionId);
            }

            setTabs((previousTabs) => previousTabs.map((candidate) => {
                if (candidate.id !== tabId || candidate.requestToken !== requestToken) return candidate;

                const completedTab: Tab = {
                    ...candidate,
                    loading: false,
                    refreshing: false,
                    commandHistory: response.commandHistory
                };

                return upsertHistoryEntry(completedTab, response, mode);
            }));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            setTabs((previousTabs) => previousTabs.map((candidate) => {
                if (candidate.id !== tabId || candidate.requestToken !== requestToken) return candidate;

                if (mode === 'navigate') {
                    const failedEntry: SnapshotResponse = {
                        sessionId: candidate.sessionId,
                        rawUrl,
                        statusMessage: 'Failed to load snapshot.',
                        errorMessage: message,
                        htmlPieces: [],
                        refs: {},
                        commandHistory: candidate.commandHistory
                    };

                    const completedTab: Tab = {
                        ...candidate,
                        loading: false,
                        refreshing: false
                    };

                    return upsertHistoryEntry(completedTab, failedEntry, mode);
                }

                return {
                    ...candidate,
                    loading: false,
                    refreshing: false,
                    statusMessage: 'Failed to refresh snapshot.',
                    errorMessage: message
                };
            }));
        }
    }, [getTabById]);

    const executeMcpCommandForTab = React.useCallback(async (tabId: number, command: McpCommand): Promise<void> => {
        const tab = getTabById(tabId);
        if (!tab?.sessionId) return;

        const previousEntry = getCurrentEntry(tab);
        const requestToken = tab.requestToken + 1;

        setTabs((previousTabs) => previousTabs.map((candidate) => {
            if (candidate.id !== tabId) return candidate;

            return {
                ...candidate,
                requestToken,
                loading: false,
                refreshing: true,
                errorMessage: ''
            };
        }));

        try {
            if (!window.snapshotApi) {
                throw new Error('Snapshot API bridge is unavailable. Restart the app.');
            }

            const response = await window.snapshotApi.executeMcpCommand({
                sessionId: tab.sessionId,
                command
            });

            const mode: LoadMode = shouldCreateHistoryEntryForCommand(command, previousEntry, response)
                ? 'navigate'
                : 'refresh';

            setTabs((previousTabs) => previousTabs.map((candidate) => {
                if (candidate.id !== tabId || candidate.requestToken !== requestToken) return candidate;

                const completedTab: Tab = {
                    ...candidate,
                    loading: false,
                    refreshing: false,
                    commandHistory: response.commandHistory
                };

                return upsertHistoryEntry(completedTab, response, mode);
            }));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            setTabs((previousTabs) => previousTabs.map((candidate) => {
                if (candidate.id !== tabId || candidate.requestToken !== requestToken) return candidate;

                return {
                    ...candidate,
                    loading: false,
                    refreshing: false,
                    statusMessage: 'Failed to execute MCP command.',
                    errorMessage: message
                };
            }));
        }
    }, [getTabById]);

    const createTab = React.useCallback((initialUrl = ''): void => {
        const tabId = nextTabIdRef.current;
        nextTabIdRef.current += 1;

        setTabs((previousTabs) => [...previousTabs, createEmptyTab(tabId, initialUrl)]);
        setActiveTabId(tabId);

        if (initialUrl.trim()) {
            void loadSnapshotForTab(tabId, initialUrl, 'navigate');
        }
    }, [loadSnapshotForTab]);

    const closeTab = React.useCallback((tabId: number): void => {
        const existingTabs = tabsRef.current;
        const index = existingTabs.findIndex((tab) => tab.id === tabId);
        if (index === -1) return;

        const tabToClose = existingTabs[index];
        if (tabToClose.sessionId && window.snapshotApi?.closeSession) {
            void window.snapshotApi.closeSession(tabToClose.sessionId);
        }

        const nextTabs = existingTabs.filter((tab) => tab.id !== tabId);

        if (nextTabs.length === 0) {
            const replacementId = nextTabIdRef.current;
            nextTabIdRef.current += 1;
            setTabs([createEmptyTab(replacementId)]);
            setActiveTabId(replacementId);
            return;
        }

        setTabs(nextTabs);

        if (activeTabIdRef.current === tabId) {
            const nextIndex = Math.max(0, index - 1);
            setActiveTabId(nextTabs[nextIndex].id);
        }
    }, []);

    React.useEffect(() => {
        createTab();
    }, [createTab]);

    React.useEffect(() => {
        if (tabs.length === 0) return;

        const hasActiveTab = activeTabId !== null && tabs.some((tab) => tab.id === activeTabId);
        if (!hasActiveTab) {
            setActiveTabId(tabs[0].id);
        }
    }, [tabs, activeTabId]);

    React.useEffect(() => {
        const interval = window.setInterval(() => {
            const tabId = activeTabIdRef.current;
            if (tabId === null) return;

            const tab = tabsRef.current.find((candidate) => candidate.id === tabId);
            if (!tab || tab.loading || tab.refreshing || !tab.sessionId) return;
            if (tab.historyIndex < 0) return;

            const onLatestEntry = tab.historyIndex === tab.history.length - 1;
            if (!onLatestEntry) return;

            void loadSnapshotForTab(tab.id, '', 'refresh');
        }, 1000);

        return () => {
            window.clearInterval(interval);
        };
    }, [loadSnapshotForTab]);

    React.useEffect(() => {
        return () => {
            const api = window.snapshotApi;
            if (!api?.closeSession) return;

            tabsRef.current.forEach((tab) => {
                if (tab.sessionId) {
                    void api.closeSession(tab.sessionId);
                }
            });
        };
    }, []);

    const activeTab = React.useMemo(() => {
        if (activeTabId === null) return null;
        return tabs.find((tab) => tab.id === activeTabId) || null;
    }, [tabs, activeTabId]);

    const activeEntry = getCurrentEntry(activeTab);
    const isLoading = Boolean(activeTab?.loading || activeTab?.refreshing);

    const submitActiveTab = React.useCallback((event: React.FormEvent<HTMLFormElement>): void => {
        event.preventDefault();

        const tab = tabsRef.current.find((candidate) => candidate.id === activeTabIdRef.current);
        if (!tab) return;

        void loadSnapshotForTab(tab.id, tab.inputValue || '', 'navigate');
    }, [loadSnapshotForTab]);

    const updateActiveInput = React.useCallback((event: React.ChangeEvent<HTMLInputElement>): void => {
        const value = event.target.value;
        const tabId = activeTabIdRef.current;
        if (tabId === null) return;

        setTabs((previousTabs) => previousTabs.map((tab) => {
            if (tab.id !== tabId) return tab;
            return {
                ...tab,
                inputValue: value
            };
        }));
    }, []);

    const goBack = React.useCallback((): void => {
        const tabId = activeTabIdRef.current;
        if (tabId === null) return;

        setTabs((previousTabs) => previousTabs.map((tab) => {
            if (tab.id !== tabId || tab.loading || tab.refreshing || tab.historyIndex <= 0) return tab;

            const historyIndex = tab.historyIndex - 1;
            const entry = tab.history[historyIndex] || null;
            return applyEntryToTab({ ...tab, historyIndex }, entry, { updateInput: true });
        }));
    }, []);

    const goForward = React.useCallback((): void => {
        const tabId = activeTabIdRef.current;
        if (tabId === null) return;

        setTabs((previousTabs) => previousTabs.map((tab) => {
            if (tab.id !== tabId || tab.loading || tab.refreshing || tab.historyIndex >= tab.history.length - 1) return tab;

            const historyIndex = tab.historyIndex + 1;
            const entry = tab.history[historyIndex] || null;
            return applyEntryToTab({ ...tab, historyIndex }, entry, { updateInput: true });
        }));
    }, []);

    const reloadCurrent = React.useCallback((): void => {
        const tab = tabsRef.current.find((candidate) => candidate.id === activeTabIdRef.current);
        if (!tab || tab.loading || tab.refreshing || !tab.sessionId) return;

        void loadSnapshotForTab(tab.id, '', 'refresh');
    }, [loadSnapshotForTab]);

    const executeMcpCommand = React.useCallback(async (command: McpCommand): Promise<void> => {
        const tab = tabsRef.current.find((candidate) => candidate.id === activeTabIdRef.current);
        if (!tab || !tab.sessionId) return;

        await executeMcpCommandForTab(tab.id, command);
    }, [executeMcpCommandForTab]);

    return {
        tabs,
        activeTab,
        activeEntry,
        isLoading,
        activateTab: setActiveTabId,
        createTab,
        closeTab,
        submitActiveTab,
        updateActiveInput,
        goBack,
        goForward,
        reloadCurrent,
        executeMcpCommand
    };
}
