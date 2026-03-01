import { BrowserManager } from 'agent-browser/dist/browser.js';
import { ariaToHtml } from './src/AriaToHtml/AriaToHtml.js';
import { URL } from './src/Constants.js';

const browser = new BrowserManager();
await browser.launch({ action: 'launch', id: 'default', headless: true });


await browser.getPage().goto(URL);
const snapshot = await browser.getSnapshot({});
const ariaYaml = snapshot.tree;
console.log('-------  ARIA YAML -------');
console.log(ariaYaml);

const htmlPieces = ariaToHtml(ariaYaml);
console.log('-------  HTML pieces -------');
console.log(htmlPieces.join('\n\n'));

await browser.close();
