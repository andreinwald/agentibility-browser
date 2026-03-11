import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { registerSnapshotIpcHandlers } from './main/ipc/registerSnapshotIpc.js';
import { closeAllSnapshotSessions } from './main/services/SnapshotService.js';

if (!process.env.AGENT_BROWSER_DEFAULT_TIMEOUT) {
    process.env.AGENT_BROWSER_DEFAULT_TIMEOUT = '1000';
}

const rendererHtmlPath = path.join(app.getAppPath(), 'src', 'electron', 'index.html');
const preloadScriptPath = path.join(app.getAppPath(), 'src', 'electron', 'preload.cjs');

function createWindow(): BrowserWindow {
    const window = new BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 960,
        minHeight: 640,
        title: 'Agent-first Browser',
        webPreferences: {
            preload: preloadScriptPath,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    window.loadFile(rendererHtmlPath).catch((error) => {
        console.error('Failed to load renderer:', error);
    });

    return window;
}

app.whenReady().then(() => {
    registerSnapshotIpcHandlers();

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    void closeAllSnapshotSessions();

    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    void closeAllSnapshotSessions();
});
