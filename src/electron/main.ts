import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { loadSnapshot } from './SnapshotService.js';

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
    ipcMain.handle('snapshot:load', async (_event, rawUrl: unknown) => {
        return loadSnapshot(typeof rawUrl === 'string' ? rawUrl : '');
    });

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
