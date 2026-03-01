import { BrowserManager } from 'agent-browser/dist/browser.js';

const browser = new BrowserManager();

import express from 'express';
import { ariaToHtml } from './src/AriaToHtml/AriaToHtml';

const app = express();

app.get('/', async (req, res) => {
    await browser.launch({ action: 'launch', id: 'default', headless: true });
    await browser.getPage().goto('https://vercel.com/login');
    const snapshot = await browser.getSnapshot({});
    const html = ariaToHtml(snapshot.tree);
    res.send(`<!DOCTYPE html><html><head><title>Snapshot</title></head><body>${html}</body></html>`);
    await browser.close();
});

const PORT = 3003;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

