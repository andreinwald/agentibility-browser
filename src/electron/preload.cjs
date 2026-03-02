const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('snapshotApi', {
    loadSnapshot(url, sessionId) {
        return ipcRenderer.invoke('snapshot:load', { rawUrl: url, sessionId });
    },
    refreshSnapshot(sessionId) {
        return ipcRenderer.invoke('snapshot:refresh', { sessionId });
    },
    closeSession(sessionId) {
        return ipcRenderer.invoke('snapshot:close-session', { sessionId });
    },
    executeMcpCommand(request) {
        return ipcRenderer.invoke('snapshot:execute-mcp', request);
    }
});
