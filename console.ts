import { BrowserManager } from 'agent-browser/dist/browser.js';

const browser = new BrowserManager();
await browser.launch({ action: 'launch', id: 'default', headless: true });


import { ariaNodesToHtml } from './src/AriaToHtml';
import { parseAriaYaml } from './src/ParseAriaYaml';


await browser.getPage().goto('https://vercel.com/login');
const snapshot = await browser.getSnapshot({});
const parsedTree = parseAriaYaml(snapshot.tree);
const html = ariaNodesToHtml(parsedTree);

console.log(html);

await browser.close();
