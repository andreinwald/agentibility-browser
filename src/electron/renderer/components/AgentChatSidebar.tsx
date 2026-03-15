import type { AgentChatHistoryMessage, AgentChatToolEvent } from '../../shared/agentChat.js';
import type { CommandHistoryEntry, SnapshotResponse } from '../../shared/snapshot.js';

declare const React: typeof import('react');

type ChatMessage = {
    id: string;
    role: 'user' | 'assistant' | 'tool';
    content: string;
    createdAt: string;
};

type AgentChatSidebarProps = {
    tabId: number | null;
    sessionId?: string;
    snapshot: SnapshotResponse | null;
    commandHistory: CommandHistoryEntry[];
    onApplySnapshot: (snapshot: SnapshotResponse) => void;
};

const DEFAULT_API_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';

function nowIso(): string {
    return new Date().toISOString();
}

function createId(prefix: string): string {
    try {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (globalThis.crypto?.randomUUID) {
            return `${prefix}-${globalThis.crypto.randomUUID()}`;
        }
    } catch {
        // Ignore crypto failures and fall back to time-based id.
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toHistory(messages: ChatMessage[]): AgentChatHistoryMessage[] {
    const isHistoryMessage = (message: ChatMessage): message is ChatMessage & { role: 'user' | 'assistant' } => {
        return message.role === 'user' || message.role === 'assistant';
    };

    return messages
        .filter(isHistoryMessage)
        .map((message) => ({
            role: message.role,
            content: message.content
        }));
}

function formatToolEvent(event: AgentChatToolEvent): string {
    const argsText = Object.keys(event.args || {}).length > 0 ? JSON.stringify(event.args) : '';
    if (event.error) {
        return `${event.tool}${argsText ? ` ${argsText}` : ''}\nerror: ${event.error}`;
    }
    if (event.result) {
        return `${event.tool}${argsText ? ` ${argsText}` : ''}\nresult: ${JSON.stringify(event.result)}`;
    }
    return `${event.tool}${argsText ? ` ${argsText}` : ''}`;
}

export function AgentChatSidebar(props: AgentChatSidebarProps): React.ReactElement {
    const { tabId, sessionId, snapshot, commandHistory, onApplySnapshot } = props;

    const [view, setView] = React.useState<'chat' | 'history'>('chat');
    const [apiBaseUrl, setApiBaseUrl] = React.useState(DEFAULT_API_BASE_URL);
    const [apiKey, setApiKey] = React.useState('');
    const [model, setModel] = React.useState(DEFAULT_MODEL);

    const [draft, setDraft] = React.useState('');
    const [isSending, setIsSending] = React.useState(false);
    const [messagesByTab, setMessagesByTab] = React.useState<Record<number, ChatMessage[]>>({});

    const scrollRef = React.useRef<HTMLDivElement | null>(null);

    const messages = React.useMemo(() => {
        if (tabId === null) return [];
        return messagesByTab[tabId] || [];
    }, [messagesByTab, tabId]);

    React.useEffect(() => {
        if (view !== 'chat') return;
        const element = scrollRef.current;
        if (!element) return;
        element.scrollTop = element.scrollHeight;
    }, [messages, view]);

    const pushMessages = React.useCallback((tabKey: number, next: ChatMessage[] | ((previous: ChatMessage[]) => ChatMessage[])) => {
        setMessagesByTab((previous) => {
            const existing = previous[tabKey] || [];
            const updated = typeof next === 'function' ? next(existing) : next;
            return {
                ...previous,
                [tabKey]: updated
            };
        });
    }, []);

    const send = React.useCallback(async () => {
        if (tabId === null) return;

        const prompt = draft.trim();
        if (!prompt || isSending) return;

        const api = window.agentChatApi;
        if (!api?.sendMessage) {
            pushMessages(tabId, (previous) => [...previous, {
                id: createId('assistant'),
                role: 'assistant',
                content: 'Agent chat bridge is unavailable. Restart the app.',
                createdAt: nowIso()
            }]);
            return;
        }

        if (!sessionId) {
            pushMessages(tabId, (previous) => [...previous, {
                id: createId('assistant'),
                role: 'assistant',
                content: 'Open a page first, then ask me to interact with it.',
                createdAt: nowIso()
            }]);
            return;
        }

        setView('chat');
        setDraft('');
        setIsSending(true);

        const pendingId = createId('pending');

        pushMessages(tabId, (previous) => [
            ...previous,
            {
                id: createId('user'),
                role: 'user',
                content: prompt,
                createdAt: nowIso()
            },
            {
                id: pendingId,
                role: 'assistant',
                content: 'Thinking...',
                createdAt: nowIso()
            }
        ]);

        try {
            const response = await api.sendMessage({
                sessionId,
                prompt,
                history: toHistory(messages),
                apiBaseUrl,
                apiKey,
                model
            });

            pushMessages(tabId, (previous) => {
                const withoutPending = previous.filter((message) => message.id !== pendingId);
                const toolMessages: ChatMessage[] = (response.toolEvents || []).map((event) => ({
                    id: createId('tool'),
                    role: 'tool',
                    content: formatToolEvent(event),
                    createdAt: nowIso()
                }));

                return [
                    ...withoutPending,
                    ...toolMessages,
                    {
                        id: createId('assistant'),
                        role: 'assistant',
                        content: response.assistantMessage || '(No response text returned.)',
                        createdAt: nowIso()
                    }
                ];
            });

            if (response.snapshot) {
                onApplySnapshot(response.snapshot);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            pushMessages(tabId, (previous) => [
                ...previous.filter((message) => message.id !== pendingId),
                {
                    id: createId('assistant'),
                    role: 'assistant',
                    content: `Request failed: ${message}`,
                    createdAt: nowIso()
                }
            ]);
        } finally {
            setIsSending(false);
        }
    }, [apiBaseUrl, apiKey, draft, isSending, messages, model, onApplySnapshot, pushMessages, sessionId, tabId]);

    const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key !== 'Enter' || event.shiftKey) return;
        event.preventDefault();
        void send();
    }, [send]);

    const renderChatMessage = React.useCallback((message: ChatMessage): React.ReactElement => {
        const isUser = message.role === 'user';
        const isTool = message.role === 'tool';

        const bubbleClass = isTool
            ? 'rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground'
            : isUser
                ? 'rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground'
                : 'rounded-2xl bg-muted px-3 py-2 text-sm text-foreground';

        const alignment = isUser ? 'flex justify-end' : 'flex justify-start';

        return (
            <div key={message.id} className={alignment}>
                <div className="max-w-[92%]">
                    <div className={bubbleClass} style={{ whiteSpace: 'pre-wrap' }}>
                        {message.content}
                    </div>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                        {new Date(message.createdAt).toLocaleTimeString()}
                    </div>
                </div>
            </div>
        );
    }, []);

    const renderHistoryEntry = React.useCallback((entry: CommandHistoryEntry): React.ReactElement => {
        const statusClass = entry.status === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
        return (
            <div key={entry.id} className="rounded-md border border-border bg-muted/40 p-3">
                <div className="mb-1 font-mono text-[11px] break-all">{entry.commandLine}</div>
                <div className="mb-2 text-[10px] text-muted-foreground">{new Date(entry.executedAt).toLocaleTimeString()}</div>
                <div className={`mb-2 text-[10px] font-semibold uppercase tracking-wide ${statusClass}`}>
                    {entry.status}
                </div>
                <div className="space-y-1 font-mono text-[10px] text-muted-foreground">
                    {Object.entries(entry.params).map(([key, value]) => (
                        <div key={`${entry.id}-${key}`}>{key}: {String(value)}</div>
                    ))}
                </div>
                {entry.errorMessage ? (
                    <div className="mt-2 rounded border border-red-300/40 bg-red-50/60 px-2 py-1 text-[10px] text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                        {entry.errorMessage}
                    </div>
                ) : null}
            </div>
        );
    }, []);

    const currentUrl = snapshot?.targetUrl || snapshot?.rawUrl || '';

    return (
        <div className="flex h-full flex-col">
            <div className="border-b border-border px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <div className="text-sm font-semibold">Agent Chat</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground break-all">
                            {currentUrl ? `Tab: ${currentUrl}` : 'No page loaded'}
                        </div>
                    </div>
                    <div className="flex items-center gap-1 rounded-full border border-border bg-muted/30 p-1 text-xs">
                        <button
                            type="button"
                            className={view === 'chat' ? 'rounded-full bg-card px-2 py-1 text-foreground shadow-sm' : 'rounded-full px-2 py-1 text-muted-foreground hover:text-foreground'}
                            onClick={() => setView('chat')}
                        >
                            Chat
                        </button>
                        <button
                            type="button"
                            className={view === 'history' ? 'rounded-full bg-card px-2 py-1 text-foreground shadow-sm' : 'rounded-full px-2 py-1 text-muted-foreground hover:text-foreground'}
                            onClick={() => setView('history')}
                        >
                            History
                        </button>
                    </div>
                </div>
            </div>

            {view === 'history' ? (
                <div className="flex-1 space-y-3 overflow-y-auto p-4 text-xs">
                    {commandHistory.length > 0 ? commandHistory.slice().reverse().map(renderHistoryEntry) : (
                        <div className="rounded-md border border-dashed border-border p-4 text-muted-foreground">
                            No MCP commands yet. Click a link or ask the agent to do something.
                        </div>
                    )}
                </div>
            ) : (
                <>
                    <div className="border-b border-border p-4">
                        <div className="grid gap-3">
                            <label className="grid gap-1 text-xs font-medium">
                                API Base URL
                                <input
                                    type="text"
                                    value={apiBaseUrl}
                                    onChange={(event) => setApiBaseUrl(event.target.value)}
                                    placeholder={DEFAULT_API_BASE_URL}
                                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-xs text-foreground shadow-sm outline-none focus:border-ring"
                                />
                            </label>
                            <label className="grid gap-1 text-xs font-medium">
                                API Key
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={(event) => setApiKey(event.target.value)}
                                    placeholder="sk-..."
                                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-xs text-foreground shadow-sm outline-none focus:border-ring"
                                />
                            </label>
                            <label className="grid gap-1 text-xs font-medium">
                                Model
                                <input
                                    type="text"
                                    value={model}
                                    onChange={(event) => setModel(event.target.value)}
                                    placeholder={DEFAULT_MODEL}
                                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-xs text-foreground shadow-sm outline-none focus:border-ring"
                                />
                            </label>
                            <div className="text-[11px] text-muted-foreground">
                                Keys are only kept in memory for this run.
                            </div>
                        </div>
                    </div>

                    <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
                        {messages.length > 0 ? messages.map(renderChatMessage) : (
                            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                                Ask the agent to navigate or click something on the current page.
                            </div>
                        )}
                    </div>

                    <div className="border-t border-border p-3">
                        <div className="flex items-end gap-2">
                            <textarea
                                value={draft}
                                onChange={(event) => setDraft(event.target.value)}
                                onKeyDown={handleKeyDown}
                                rows={2}
                                placeholder={sessionId ? 'Message the agent… (Enter to send, Shift+Enter for newline)' : 'Open a page first…'}
                                className="min-h-[42px] flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none focus:border-ring disabled:opacity-60"
                                disabled={isSending}
                            />
                            <button
                                type="button"
                                className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm disabled:opacity-50"
                                onClick={() => {
                                    void send();
                                }}
                                disabled={isSending || !draft.trim()}
                            >
                                Send
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
