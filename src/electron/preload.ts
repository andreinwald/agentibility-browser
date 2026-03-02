import { contextBridge, ipcRenderer } from 'electron';
import type { SnapshotResponse } from '../BrowserUI/SnapshotService.js';

const snapshotApi = {
    loadSnapshot: (url: string): Promise<SnapshotResponse> => ipcRenderer.invoke('snapshot:load', url)
};

contextBridge.exposeInMainWorld('snapshotApi', snapshotApi);
