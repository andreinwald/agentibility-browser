import { ipcMain } from 'electron';
import type { LoadSnapshotRequest } from '../../shared/snapshot.js';
import { closeSnapshotSession, loadSnapshot, refreshSnapshot } from '../services/SnapshotService.js';

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
}
