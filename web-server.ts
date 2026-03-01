import { BrowserManager } from 'agent-browser/dist/browser.js';

const browser = new BrowserManager();

import express from 'express';
import { ariaToHtml } from './src/AriaToHtml/AriaToHtml';
import { URL } from './src/Constants.js';

const app = express();

app.get('/', async (req, res) => {
    await browser.launch({ action: 'launch', id: 'default', headless: true });
    await browser.getPage().goto(URL);
    const snapshot = await browser.getSnapshot({});
    console.log('---------------------------------------')
    console.log(snapshot.tree)
    const htmlPieces = ariaToHtml(snapshot.tree);
    const wrappedHtmlPieces = htmlPieces.map((piece) => `<div>${piece}</div>`);
    res.send(`<!DOCTYPE html><html><head><title>Snapshot</title></head><body>${wrappedHtmlPieces.join('\n')}</body></html>`);
    await browser.close();
});

const PORT = 3003;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
