import { executeCommand } from 'agent-browser/dist/actions.js';
import { BrowserManager } from 'agent-browser/dist/browser.js';
import type { Command, Response } from 'agent-browser/dist/types.js';
import { ariaToHtml } from '../../../AriaToHtml/AriaToHtml.js';
import type {
    CommandHistoryEntry,
    ExecuteMcpRequest,
    McpCommand,
    LoadSnapshotRequest,
    SnapshotRefs,
    SnapshotResponse
} from '../../shared/snapshot.js';

type SnapshotSession = {
    id: string;
    browser: BrowserManager;
    launched: boolean;
    commandHistory: CommandHistoryEntry[];
    nextCommandNumber: number;
};

type SessionSnapshot = {
    htmlPieces: string[];
    currentUrl: string;
    refs: SnapshotRefs;
};

type CommandExecutionResult = {
    historyEntry: CommandHistoryEntry;
    errorMessage?: string;
};

const MAX_COMMAND_HISTORY = 200;
const sessions = new Map<string, SnapshotSession>();
let nextSessionId = 1;

export function normalizeRequestedUrl(raw: string): string | undefined {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;

    let candidate = trimmed;
    if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(candidate)) {
        candidate = `https://${candidate}`;
    }

    try {
        const parsed = new URL(candidate);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return undefined;
        }
        return parsed.toString();
    } catch {
        return undefined;
    }
}

function createSession(preferredId?: string): SnapshotSession {
    const requestedId = typeof preferredId === 'string' ? preferredId.trim() : '';
    if (requestedId && sessions.has(requestedId)) {
        return sessions.get(requestedId)!;
    }

    let id = requestedId || `session-${nextSessionId}`;
    while (sessions.has(id)) {
        nextSessionId += 1;
        id = `session-${nextSessionId}`;
    }

    if (!requestedId) {
        nextSessionId += 1;
    }

    const session: SnapshotSession = {
        id,
        browser: new BrowserManager(),
        launched: false,
        commandHistory: [],
        nextCommandNumber: 1
    };

    sessions.set(id, session);

    return session;
}

function getOrCreateSession(sessionId?: string): SnapshotSession {
    const normalized = typeof sessionId === 'string' ? sessionId.trim() : '';
    if (normalized) {
        const existing = sessions.get(normalized);
        if (existing) return existing;
        return createSession(normalized);
    }

    return createSession();
}

async function ensureSessionReady(session: SnapshotSession): Promise<void> {
    if (!session.launched) {
        await session.browser.launch({ action: 'launch', id: 'default', headless: true });
        session.launched = true;
    }

    await session.browser.ensurePage();
}

async function getSnapshotFromSession(session: SnapshotSession): Promise<SessionSnapshot> {
    const snapshot = await session.browser.getSnapshot({});
    const htmlPieces = ariaToHtml(snapshot.tree);
    const currentUrl = session.browser.getPage().url() || '';

    return {
        htmlPieces,
        currentUrl,
        refs: snapshot.refs
    };
}

function createBaseSnapshotResponse(options: {
    sessionId?: string;
    rawUrl?: string;
    targetUrl?: string;
    statusMessage: string;
    errorMessage: string;
    commandHistory?: CommandHistoryEntry[];
}): SnapshotResponse {
    return {
        sessionId: options.sessionId,
        rawUrl: options.rawUrl || '',
        targetUrl: options.targetUrl,
        statusMessage: options.statusMessage,
        errorMessage: options.errorMessage,
        htmlPieces: [],
        refs: {},
        commandHistory: options.commandHistory || []
    };
}

async function buildSnapshotResponse(
    session: SnapshotSession,
    options: {
        rawUrl?: string;
        targetUrl?: string;
        statusMessage?: string;
        errorMessage?: string;
    }
): Promise<SnapshotResponse> {
    const { htmlPieces, currentUrl, refs } = await getSnapshotFromSession(session);
    const defaultStatus = currentUrl ? `Viewing ${currentUrl}` : 'Viewing current page';

    return {
        sessionId: session.id,
        rawUrl: options.rawUrl ?? currentUrl,
        targetUrl: currentUrl || options.targetUrl,
        statusMessage: options.statusMessage ?? defaultStatus,
        errorMessage: options.errorMessage ?? '',
        htmlPieces,
        refs,
        commandHistory: [...session.commandHistory]
    };
}

function normalizeSelector(selector: string): string {
    const trimmed = selector.trim();
    if (!trimmed) {
        throw new Error('Missing selector.');
    }

    if (/^@?e\d+$/i.test(trimmed)) {
        return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
    }

    return trimmed;
}

function nextCommandId(session: SnapshotSession): string {
    const id = `${session.id}-cmd-${session.nextCommandNumber}`;
    session.nextCommandNumber += 1;
    return id;
}

function toCommandLine(command: McpCommand): string {
    switch (command.action) {
        case 'open': {
            const alias = command.alias ?? 'open';
            return `agent-browser ${alias} ${command.url}`;
        }
        case 'click': {
            const withNewTab = command.newTab ? ' --new-tab' : '';
            return `agent-browser click ${command.selector}${withNewTab}`;
        }
        case 'dblclick':
            return `agent-browser dblclick ${command.selector}`;
        case 'focus':
            return `agent-browser focus ${command.selector}`;
    }
}

function toHistoryParams(command: McpCommand): Record<string, string | boolean> {
    switch (command.action) {
        case 'open':
            return {
                url: command.url,
                waitUntil: command.waitUntil ?? 'domcontentloaded'
            };
        case 'click':
            return {
                selector: command.selector,
                ...(command.newTab ? { newTab: true } : {})
            };
        case 'dblclick':
            return {
                selector: command.selector
            };
        case 'focus':
            return {
                selector: command.selector
            };
    }
}

function toAgentBrowserCommand(session: SnapshotSession, command: McpCommand): McpCommand & { commandId: string; protocolCommand: Command } {
    const commandId = nextCommandId(session);

    switch (command.action) {
        case 'open': {
            const normalizedUrl = normalizeRequestedUrl(command.url);
            if (!normalizedUrl) {
                throw new Error('Invalid URL. Use http:// or https:// (or enter a hostname).');
            }

            const waitUntil = command.waitUntil ?? 'domcontentloaded';
            return {
                ...command,
                url: normalizedUrl,
                waitUntil,
                commandId,
                protocolCommand: {
                    id: commandId,
                    action: 'navigate',
                    url: normalizedUrl,
                    waitUntil
                }
            };
        }
        case 'click': {
            const selector = normalizeSelector(command.selector);
            return {
                ...command,
                selector,
                commandId,
                protocolCommand: {
                    id: commandId,
                    action: 'click',
                    selector,
                    ...(command.newTab ? { newTab: true } : {})
                }
            };
        }
        case 'dblclick': {
            const selector = normalizeSelector(command.selector);
            return {
                ...command,
                selector,
                commandId,
                protocolCommand: {
                    id: commandId,
                    action: 'dblclick',
                    selector
                }
            };
        }
        case 'focus': {
            const selector = normalizeSelector(command.selector);
            return {
                ...command,
                selector,
                commandId,
                protocolCommand: {
                    id: commandId,
                    action: 'focus',
                    selector
                }
            };
        }
    }
}

function appendCommandHistory(session: SnapshotSession, entry: CommandHistoryEntry): void {
    session.commandHistory.push(entry);
    if (session.commandHistory.length > MAX_COMMAND_HISTORY) {
        session.commandHistory.splice(0, session.commandHistory.length - MAX_COMMAND_HISTORY);
    }
}

async function executeSessionCommand(session: SnapshotSession, command: McpCommand): Promise<CommandExecutionResult> {
    const mapped = toAgentBrowserCommand(session, command);
    const commandLine = toCommandLine(mapped);
    const params = toHistoryParams(mapped);

    const result: Response = await executeCommand(mapped.protocolCommand, session.browser);

    const historyEntry: CommandHistoryEntry = {
        id: mapped.commandId,
        action: mapped.action,
        commandLine,
        params,
        status: result.success ? 'success' : 'error',
        errorMessage: result.success ? undefined : result.error,
        executedAt: new Date().toISOString()
    };

    appendCommandHistory(session, historyEntry);

    if (result.success) {
        return { historyEntry };
    }

    return {
        historyEntry,
        errorMessage: result.error
    };
}

function parseSessionId(raw: unknown): string {
    return typeof raw === 'string' ? raw.trim() : '';
}

function getSessionOrError(normalizedSessionId: string): SnapshotSession | null {
    if (!normalizedSessionId) {
        return null;
    }

    const session = sessions.get(normalizedSessionId);
    return session || null;
}

export async function closeSnapshotSession(sessionId: string): Promise<void> {
    const normalized = sessionId.trim();
    if (!normalized) return;

    const session = sessions.get(normalized);
    if (!session) return;

    sessions.delete(normalized);

    if (session.launched) {
        await session.browser.close().catch(() => undefined);
    }
}

export async function closeAllSnapshotSessions(): Promise<void> {
    const sessionIds = Array.from(sessions.keys());
    await Promise.all(sessionIds.map((sessionId) => closeSnapshotSession(sessionId)));
}

export async function refreshSnapshot(sessionId: string): Promise<SnapshotResponse> {
    const normalized = parseSessionId(sessionId);
    if (!normalized) {
        return createBaseSnapshotResponse({
            rawUrl: '',
            statusMessage: 'Failed to refresh snapshot.',
            errorMessage: 'Missing session id.'
        });
    }

    const session = getSessionOrError(normalized);
    if (!session) {
        return createBaseSnapshotResponse({
            sessionId: normalized,
            rawUrl: '',
            statusMessage: 'Failed to refresh snapshot.',
            errorMessage: 'Session expired. Reload the tab.'
        });
    }

    try {
        await ensureSessionReady(session);
        return await buildSnapshotResponse(session, {});
    } catch (error) {
        return createBaseSnapshotResponse({
            sessionId: session.id,
            rawUrl: '',
            statusMessage: 'Failed to refresh snapshot.',
            errorMessage: error instanceof Error ? error.message : String(error),
            commandHistory: [...session.commandHistory]
        });
    }
}

export async function loadSnapshot(request: LoadSnapshotRequest): Promise<SnapshotResponse> {
    const rawUrl = typeof request.rawUrl === 'string' ? request.rawUrl : '';
    const sessionId = typeof request.sessionId === 'string' ? request.sessionId : undefined;
    const targetUrl = normalizeRequestedUrl(rawUrl);

    if (rawUrl && !targetUrl) {
        return createBaseSnapshotResponse({
            sessionId,
            rawUrl,
            statusMessage: 'Enter a valid URL and press Go.',
            errorMessage: 'Invalid URL. Use http:// or https:// (or enter a hostname).'
        });
    }

    if (!targetUrl) {
        return createBaseSnapshotResponse({
            sessionId,
            rawUrl,
            statusMessage: 'Enter a URL and press Go.',
            errorMessage: ''
        });
    }

    const session = getOrCreateSession(sessionId);

    try {
        await ensureSessionReady(session);
        const execution = await executeSessionCommand(session, {
            action: 'open',
            alias: 'open',
            url: targetUrl,
            waitUntil: 'domcontentloaded'
        });

        return await buildSnapshotResponse(session, {
            rawUrl,
            targetUrl,
            statusMessage: execution.errorMessage ? `Failed to load ${targetUrl}` : `Viewing ${targetUrl}`,
            errorMessage: execution.errorMessage || ''
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        try {
            return await buildSnapshotResponse(session, {
                rawUrl,
                targetUrl,
                statusMessage: `Failed to load ${targetUrl}`,
                errorMessage: message
            });
        } catch {
            return createBaseSnapshotResponse({
                sessionId: session.id,
                rawUrl,
                targetUrl,
                statusMessage: `Failed to load ${targetUrl}`,
                errorMessage: message,
                commandHistory: [...session.commandHistory]
            });
        }
    }
}

export async function executeMcpCommand(request: ExecuteMcpRequest): Promise<SnapshotResponse> {
    const normalized = parseSessionId(request.sessionId);
    if (!normalized) {
        return createBaseSnapshotResponse({
            rawUrl: '',
            statusMessage: 'Failed to execute MCP command.',
            errorMessage: 'Missing session id.'
        });
    }

    const session = getSessionOrError(normalized);
    if (!session) {
        return createBaseSnapshotResponse({
            sessionId: normalized,
            rawUrl: '',
            statusMessage: 'Failed to execute MCP command.',
            errorMessage: 'Session expired. Reload the tab.'
        });
    }

    try {
        await ensureSessionReady(session);
        const execution = await executeSessionCommand(session, request.command);

        return await buildSnapshotResponse(session, {
            statusMessage: execution.errorMessage
                ? `Failed: ${execution.historyEntry.commandLine}`
                : `Executed ${execution.historyEntry.commandLine}`,
            errorMessage: execution.errorMessage || ''
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        try {
            return await buildSnapshotResponse(session, {
                statusMessage: 'Failed to execute MCP command.',
                errorMessage: message
            });
        } catch {
            return createBaseSnapshotResponse({
                sessionId: session.id,
                rawUrl: '',
                statusMessage: 'Failed to execute MCP command.',
                errorMessage: message,
                commandHistory: [...session.commandHistory]
            });
        }
    }
}
