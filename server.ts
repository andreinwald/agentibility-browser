import { BrowserManager } from 'agent-browser/dist/browser.js';

const browser = new BrowserManager();
await browser.launch({ action: 'launch', id: 'default', headless: true });


import express from 'express';
import { ariaNodesToHtml } from './src/AriaToHtml/NodesToHtml';
import { parseAriaYaml } from './src/AriaToHtml/NodesToHtml';
const app = express();

app.get('/', async (req, res) => {
    await browser.getPage().goto('https://vercel.com/login');
    const snapshot = await browser.getSnapshot({});
    const parsedTree = parseAriaYaml(snapshot.tree);
    const html = ariaNodesToHtml(parsedTree);

    res.send(`<!DOCTYPE html><html><head><title>Snapshot</title></head><body>${html}</body></html>`);
});

const PORT = 3002;
const server = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

const cleanup = async () => {
    console.log('\\nClosing browser...');
    await browser.close();
    server.close(() => {
        console.log('Server closed.');
        process.exit(0);
    });
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
