import type { McpCommand, OverlayHint } from '../shared/snapshot.js';
import { AgentChatSidebar } from './components/AgentChatSidebar.js';
import { BrowserChrome } from './components/BrowserChrome.js';
import { SnapshotContent } from './components/SnapshotContent.js';
import { useSnapshotTabs } from './hooks/useSnapshotTabs.js';

declare const React: typeof import('react');

export function App(): React.ReactElement {
    const {
        tabs,
        activeTab,
        activeEntry,
        isLoading,
        activateTab,
        createTab,
        closeTab,
        submitActiveTab,
        updateActiveInput,
        goBack,
        goForward,
        reloadCurrent,
        executeMcpCommand,
        applySnapshotResponse
    } = useSnapshotTabs();

    const [isExecutingCommand, setIsExecutingCommand] = React.useState(false);

    const handleMcpAction = React.useCallback(async (command: McpCommand): Promise<void> => {
        if (!activeTab?.sessionId || isExecutingCommand) return;

        setIsExecutingCommand(true);
        try {
            await executeMcpCommand(command);
        } finally {
            setIsExecutingCommand(false);
        }
    }, [activeTab?.sessionId, executeMcpCommand, isExecutingCommand]);

    const history = activeTab?.commandHistory || [];
    const overlayHints = activeEntry?.overlayHints || [];

    const handleOverlayAction = React.useCallback(async (selector: string): Promise<void> => {
        const trimmed = selector.trim();
        if (!trimmed) return;
        await handleMcpAction({
            action: 'click',
            selector: trimmed
        });
    }, [handleMcpAction]);

    const renderOverlayHint = React.useCallback((hint: OverlayHint): React.ReactElement => {
        return (
            <div key={hint.id} className="rounded-md border border-amber-300/60 bg-amber-50/80 p-3 text-xs text-amber-900">
                <div className="mb-1 font-semibold">
                    {hint.reason}
                </div>
                <div className="mb-2 text-[11px] uppercase tracking-wide">
                    {hint.kind} · {hint.confidence} confidence
                </div>

                {hint.closeActions.length > 0 ? (
                    <div className="mb-2 flex flex-wrap gap-2">
                        {hint.closeActions.slice(0, 4).map((action) => (
                            <button
                                key={`${hint.id}-${action.selector}`}
                                type="button"
                                className="rounded border border-amber-400/70 bg-white/80 px-2 py-1 text-[11px] font-medium text-amber-900 hover:bg-white"
                                title={action.selector}
                                onClick={() => {
                                    void handleOverlayAction(action.selector);
                                }}
                            >
                                {action.label}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="mb-2 text-[11px]">
                        No close button found in ARIA snapshot. Use DOM snippet below for selector hints.
                    </div>
                )}

                {hint.htmlSnippet ? (
                    <details>
                        <summary className="cursor-pointer text-[11px] font-medium">DOM snippet</summary>
                        <pre className="mt-1 overflow-x-auto rounded border border-amber-300/70 bg-white/70 p-2 text-[10px] leading-relaxed text-amber-950">
                            {hint.htmlSnippet}
                        </pre>
                    </details>
                ) : null}
            </div>
        );
    }, [handleOverlayAction]);

    return (
        <div className="flex h-screen w-full overflow-hidden bg-background">
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <BrowserChrome
                    tabs={tabs}
                    activeTab={activeTab}
                    isLoading={isLoading || isExecutingCommand}
                    onActivateTab={activateTab}
                    onCreateTab={() => {
                        createTab();
                    }}
                    onCloseTab={closeTab}
                    onSubmit={submitActiveTab}
                    onInputChange={updateActiveInput}
                    onBack={goBack}
                    onForward={goForward}
                    onReload={reloadCurrent}
                />

                <main className="relative mx-auto w-full max-w-6xl flex-1 overflow-auto px-3 py-4" id="content">
                    {isExecutingCommand ? (
                        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 rounded-lg border border-border bg-card/95 px-3 py-2 text-xs text-muted-foreground shadow-sm backdrop-blur">
                            Executing MCP command via BrowserManager...
                        </div>
                    ) : null}
                    {overlayHints.length > 0 ? (
                        <section className="mb-3 space-y-2 rounded-lg border border-amber-300/70 bg-amber-100/40 p-3">
                            <h2 className="text-sm font-semibold text-amber-950">Potential blocking modal / overlay detected</h2>
                            {overlayHints.slice(0, 2).map(renderOverlayHint)}
                        </section>
                    ) : null}
                    <SnapshotContent htmlPieces={activeEntry?.htmlPieces} onMcpAction={handleMcpAction} />
                </main>
            </div>

            <aside className="hidden w-96 flex-shrink-0 border-l border-border bg-card lg:flex lg:flex-col">
                <AgentChatSidebar
                    tabId={activeTab?.id ?? null}
                    sessionId={activeTab?.sessionId}
                    snapshot={activeEntry}
                    commandHistory={history}
                    onApplySnapshot={applySnapshotResponse}
                />
            </aside>
        </div>
    );
}
