import { contextBridge, ipcRenderer } from 'electron';
import type { SnapshotApi } from './shared/snapshot.js';

const snapshotApi: SnapshotApi = {
    loadSnapshot: (url: string, sessionId?: string) => {
        return ipcRenderer.invoke('snapshot:load', { rawUrl: url, sessionId });
    },
    refreshSnapshot: (sessionId: string) => {
        return ipcRenderer.invoke('snapshot:refresh', { sessionId });
    },
    closeSession: (sessionId: string) => {
        return ipcRenderer.invoke('snapshot:close-session', { sessionId });
    }
};

contextBridge.exposeInMainWorld('snapshotApi', snapshotApi);
