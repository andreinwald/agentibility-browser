import type { ExecuteMcpRequest, SnapshotApi } from './shared/snapshot.js';
import { contextBridge, ipcRenderer } from 'electron';

const snapshotApi: SnapshotApi = {
    loadSnapshot: (url: string, sessionId?: string) => {
        return ipcRenderer.invoke('snapshot:load', { rawUrl: url, sessionId });
    },
    refreshSnapshot: (sessionId: string) => {
        return ipcRenderer.invoke('snapshot:refresh', { sessionId });
    },
    closeSession: (sessionId: string) => {
        return ipcRenderer.invoke('snapshot:close-session', { sessionId });
    },
    executeMcpCommand: (request: ExecuteMcpRequest) => {
        return ipcRenderer.invoke('snapshot:execute-mcp', request);
    }
};

contextBridge.exposeInMainWorld('snapshotApi', snapshotApi);
