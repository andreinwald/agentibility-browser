import { BrowserManager } from 'agent-browser/dist/browser.js';
import * as yaml from 'js-yaml';

const browser = new BrowserManager();
await browser.launch({ action: 'launch', id: 'default', headless: true });
await browser.getPage().goto('https://vercel.com/login');


interface AriaNode {
    role: string;
    name?: string;
    attributes: Record<string, string>;
    children: AriaNode[];
    text?: string;
}


function parseAriaNodeString(str: string): { role: string; name?: string; attributes: Record<string, string> } {
    const node: { role: string; name?: string; attributes: Record<string, string> } = {
        role: '',
        attributes: {}
    };

    // Extract role (first word)
    const firstSpace = str.indexOf(' ');
    if (firstSpace === -1) {
        node.role = str;
        return node;
    }

    node.role = str.substring(0, firstSpace);
    let remaining = str.substring(firstSpace + 1).trim();

    // Extract name in quotes
    if (remaining.startsWith('"')) {
        const nextQuote = remaining.indexOf('"', 1);
        if (nextQuote !== -1) {
            node.name = remaining.substring(1, nextQuote);
            remaining = remaining.substring(nextQuote + 1).trim();
        }
    }

    // Extract attributes [k=v]
    const attrParts = remaining.split('[');
    for (const part of attrParts) {
        if (!part.includes('=')) continue;
        const [k, v] = part.split(']')[0].split('=');
        if (k && v) {
            node.attributes[k.trim()] = v.trim();
        }
    }

    return node;
}

function parseAriaTree(treeStr: string): AriaNode[] {
    const data = yaml.load(treeStr) as any[];
    if (!data || !Array.isArray(data)) return [];

    const recurse = (item: any): AriaNode => {
        if (typeof item === 'string') {
            const { role, name, attributes } = parseAriaNodeString(item);
            return { role, name, attributes, children: [] };
        }

        // It's an object with one key
        const keys = Object.keys(item);
        const header = keys[0];
        const value = item[header];
        const { role, name, attributes } = parseAriaNodeString(header);

        const node: AriaNode = { role, name, attributes, children: [] };

        if (Array.isArray(value)) {
            node.children = value.map(recurse);
        } else if (typeof value === 'string') {
            node.text = value;
        }

        return node;
    };

    return data.map(recurse);
}

function ariaNodesToHtml(nodes: AriaNode[], indentLevel = 0): string {
    const indent = '  '.repeat(indentLevel);
    return nodes.map(node => {
        let tag = 'div';
        if (node.role === 'link') tag = 'a';
        else if (node.role === 'button') tag = 'button';
        else if (node.role === 'img') tag = 'img';
        else if (node.role === 'heading') tag = node.attributes.level ? `h${node.attributes.level}` : 'h1';
        else if (node.role === 'paragraph' || node.role === 'text') tag = 'p';
        else if (node.role === 'list') tag = 'ul';
        else if (node.role === 'listitem') tag = 'li';
        else if (node.role === 'textbox' || node.role === 'searchbox') tag = 'input';
        else if (node.role === 'checkbox') tag = 'input type="checkbox"';
        else if (node.role === 'radio') tag = 'input type="radio"';

        const validChildren = node.children.filter(c => c.role !== '/url');
        const hasChildren = validChildren.length > 0;
        let style = "display: block;";
        if (validChildren.length > 1) {
            style += " border: 1px solid #aaa; padding-left: 10px";
        }
        let attrs = `role="${node.role}" style="${style}" `;

        if (node.name) {
            attrs += ` aria-label="${node.name.replace(/"/g, '&quot;')}"`;
        }

        // Handle /url child nodes for links
        if (node.role === 'link' && node.children.some(c => c.role === '/url')) {
            const urlNode = node.children.find(c => c.role === '/url');
            if (urlNode && urlNode.text) {
                attrs += ` href="${urlNode.text.replace(/"/g, '&quot;')}"`;
            }
        }

        for (const [k, v] of Object.entries(node.attributes)) {
            if (k === 'level' && node.role === 'heading') continue; // Handled in tag
            attrs += ` data-${k}="${v.replace(/"/g, '&quot;')}"`;
        }

        const isVoid = ['img', 'input'].includes(tag.split(' ')[0]);
        let html = `${indent}<${tag} ${attrs}${isVoid ? ' />' : '>'}`;

        if (!isVoid) {
            let inner = '';
            // If it's a link, use the name as text content if it exists
            if (['link', 'heading'].includes(node.role) && node.name) {
                inner += node.name;
            }

            // Don't render /url as individual sub-elements if handled already

            if (node.text) inner += node.text;

            if (validChildren.length > 0) {
                inner += '\n' + ariaNodesToHtml(validChildren, indentLevel + 1) + `\n${indent}`;
            }
            html += `${inner}</${tag.split(' ')[0]}>`;
        }
        return html;
    }).join('\n');
}


import express from 'express';
const app = express();

app.get('/', async (req, res) => {
    const snapshot = await browser.getSnapshot({});
    const parsedTree = parseAriaTree(snapshot.tree);
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

// await browser.startScreencast((frame) => {
//     // frame.data is base64-encoded image
//     // frame.metadata contains viewport info
//     console.log('Frame received:', frame.metadata.deviceWidth, 'x', frame.metadata.deviceHeight);
// }, {
//     format: 'jpeg',
//     quality: 80,
//     maxWidth: 1280,
//     maxHeight: 720,
// });

// // Inject mouse events
// await browser.injectMouseEvent({
//     type: 'mousePressed',
//     x: 100,
//     y: 200,
//     button: 'left',
// });

// // Inject keyboard events
// await browser.injectKeyboardEvent({
//     type: 'keyDown',
//     key: 'Enter',
//     code: 'Enter',
// });

// // Stop when done
// await new Promise(r => setTimeout(r, 2000));
// await browser.stopScreencast();
// await browser.close();