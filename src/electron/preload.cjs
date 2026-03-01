const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('snapshotApi', {
    loadSnapshot(url) {
        return ipcRenderer.invoke('snapshot:load', url);
    }
});
