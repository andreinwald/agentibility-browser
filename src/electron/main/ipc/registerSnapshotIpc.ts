import { ipcMain } from 'electron';
import type { ExecuteMcpRequest, LoadSnapshotRequest, McpCommand, WaitForCommand } from '../../shared/snapshot.js';
import { closeSnapshotSession, loadSnapshot, refreshSnapshot, executeMcpCommand } from '../services/SnapshotService.js';

function parseLoadRequest(payload: unknown): LoadSnapshotRequest {
    if (typeof payload === 'string') {
        return { rawUrl: payload };
    }

    if (!payload || typeof payload !== 'object') {
        return { rawUrl: '' };
    }

    const rawPayload = payload as { rawUrl?: unknown; sessionId?: unknown };
    return {
        rawUrl: typeof rawPayload.rawUrl === 'string' ? rawPayload.rawUrl : '',
        sessionId: typeof rawPayload.sessionId === 'string' ? rawPayload.sessionId : undefined
    };
}

function parseSessionId(payload: unknown): string {
    if (typeof payload === 'string') {
        return payload;
    }

    if (!payload || typeof payload !== 'object') {
        return '';
    }

    const rawPayload = payload as { sessionId?: unknown };
    return typeof rawPayload.sessionId === 'string' ? rawPayload.sessionId : '';
}

function parseExecuteMcpRequest(payload: unknown): ExecuteMcpRequest {
    if (!payload || typeof payload !== 'object') {
        return {
            sessionId: '',
            command: { action: 'click', selector: '' }
        };
    }

    const rawPayload = payload as { sessionId?: unknown; command?: unknown };
    return {
        sessionId: typeof rawPayload.sessionId === 'string' ? rawPayload.sessionId : '',
        command: parseMcpCommand(rawPayload.command)
    };
}

function parseWaitFor(payload: unknown): WaitForCommand | undefined {
    if (!payload || typeof payload !== 'object') return undefined;

    const rawPayload = payload as Record<string, unknown>;
    const type = typeof rawPayload.type === 'string' ? rawPayload.type : '';
    const timeoutMs = typeof rawPayload.timeoutMs === 'number' && Number.isFinite(rawPayload.timeoutMs)
        ? rawPayload.timeoutMs
        : undefined;

    if (type === 'none') {
        return { type: 'none' };
    }

    if (type === 'domcontentloaded' || type === 'load' || type === 'networkidle') {
        return {
            type,
            ...(timeoutMs ? { timeoutMs } : {})
        };
    }

    if (type === 'url') {
        const value = typeof rawPayload.value === 'string' ? rawPayload.value : '';
        if (!value.trim()) return undefined;
        return {
            type,
            value,
            ...(timeoutMs ? { timeoutMs } : {})
        };
    }

    if (type === 'selector') {
        const value = typeof rawPayload.value === 'string' ? rawPayload.value : '';
        if (!value.trim()) return undefined;
        const state = rawPayload.state === 'attached'
            || rawPayload.state === 'detached'
            || rawPayload.state === 'visible'
            || rawPayload.state === 'hidden'
            ? rawPayload.state
            : undefined;
        return {
            type,
            value,
            ...(timeoutMs ? { timeoutMs } : {}),
            ...(state ? { state } : {})
        };
    }

    return undefined;
}

function parseMcpCommand(payload: unknown): McpCommand {
    if (!payload || typeof payload !== 'object') {
        return { action: 'click', selector: '' };
    }

    const rawPayload = payload as Record<string, unknown>;
    const action = typeof rawPayload.action === 'string' ? rawPayload.action : '';
    if (action === 'open') {
        return {
            action: 'open',
            url: typeof rawPayload.url === 'string' ? rawPayload.url : '',
            waitUntil: rawPayload.waitUntil === 'load' || rawPayload.waitUntil === 'domcontentloaded' || rawPayload.waitUntil === 'networkidle'
                ? rawPayload.waitUntil
                : undefined,
            alias: rawPayload.alias === 'open' || rawPayload.alias === 'goto' || rawPayload.alias === 'navigate'
                ? rawPayload.alias
                : undefined
        };
    }

    if (action === 'type') {
        const delay = typeof rawPayload.delay === 'number' && Number.isFinite(rawPayload.delay) ? rawPayload.delay : undefined;
        return {
            action: 'type',
            selector: typeof rawPayload.selector === 'string' ? rawPayload.selector : '',
            text: typeof rawPayload.text === 'string' ? rawPayload.text : '',
            clear: Boolean(rawPayload.clear),
            ...(delay ? { delay } : {}),
            waitFor: parseWaitFor(rawPayload.waitFor)
        };
    }

    if (action === 'fill') {
        return {
            action: 'fill',
            selector: typeof rawPayload.selector === 'string' ? rawPayload.selector : '',
            value: typeof rawPayload.value === 'string' ? rawPayload.value : '',
            waitFor: parseWaitFor(rawPayload.waitFor)
        };
    }

    if (action === 'press') {
        const selector = typeof rawPayload.selector === 'string' ? rawPayload.selector : '';
        return {
            action: 'press',
            key: typeof rawPayload.key === 'string' ? rawPayload.key : '',
            ...(selector ? { selector } : {}),
            waitFor: parseWaitFor(rawPayload.waitFor)
        };
    }

    if (action === 'dblclick') {
        return {
            action: 'dblclick',
            selector: typeof rawPayload.selector === 'string' ? rawPayload.selector : '',
            waitFor: parseWaitFor(rawPayload.waitFor)
        };
    }

    if (action === 'focus') {
        return {
            action: 'focus',
            selector: typeof rawPayload.selector === 'string' ? rawPayload.selector : '',
            waitFor: parseWaitFor(rawPayload.waitFor)
        };
    }

    return {
        action: 'click',
        selector: typeof rawPayload.selector === 'string' ? rawPayload.selector : '',
        newTab: Boolean(rawPayload.newTab),
        waitFor: parseWaitFor(rawPayload.waitFor)
    };
}

export function registerSnapshotIpcHandlers(): void {
    ipcMain.handle('snapshot:load', async (_event, payload: unknown) => {
        return loadSnapshot(parseLoadRequest(payload));
    });

    ipcMain.handle('snapshot:refresh', async (_event, payload: unknown) => {
        return refreshSnapshot(parseSessionId(payload));
    });

    ipcMain.handle('snapshot:close-session', async (_event, payload: unknown) => {
        return closeSnapshotSession(parseSessionId(payload));
    });

    ipcMain.handle('snapshot:execute-mcp', async (_event, payload: unknown) => {
        const req = parseExecuteMcpRequest(payload);
        return executeMcpCommand(req);
    });
}
