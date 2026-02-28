import { BrowserManager } from 'agent-browser/dist/browser.js';

const browser = new BrowserManager();
await browser.launch({ action: 'launch', id: 'default', headless: true });
await browser.getPage().goto('https://vercel.com');


/*         interactive?: boolean;
        cursor?: boolean;
        maxDepth?: number;
        compact?: boolean;
        selector?: string;
*/

const snapshot = await browser.getSnapshot({
    compact: false
});

interface AriaNode {
    role: string;
    name?: string;
    attributes: Record<string, string>;
    children: AriaNode[];
    text?: string;
}

function parseAriaTree(treeStr: string): AriaNode[] {
    const lines = treeStr.split('\n');
    const rootNodes: AriaNode[] = [];
    const stack: { indent: number, node: AriaNode }[] = [];

    for (const line of lines) {
        if (!line.trim() || line.startsWith('#')) continue;

        const indentMatch = line.match(/^(\s*)/);
        const indent = indentMatch ? Math.floor(indentMatch[1].length / 2) : 0;

        let node: AriaNode = { role: '', attributes: {}, children: [] };

        const match = line.match(/^(\s*-\s*)([\w/]+)(?:\s*"([^"]*)")?(.*)$/);

        if (match) {
            node.role = match[2];
            if (match[3]) node.name = match[3];

            const suffix = match[4];
            if (suffix) {
                // Parse attributes [key=value]
                const attrMatches = suffix.matchAll(/\[([^=]+)=([^\]]+)\]/g);
                for (const m of attrMatches) {
                    node.attributes[m[1]] = m[2];
                }

                // If there's text after colon e.g. "text: Some text"
                const textMatch = suffix.match(/:\s*(.*)/);
                if (textMatch && !textMatch[1].startsWith('[')) {
                    node.text = textMatch[1].trim();
                }
            }
        } else {
            node.text = line.trim().replace(/^- /, '');
        }

        while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
            stack.pop();
        }

        if (stack.length === 0) {
            rootNodes.push(node);
        } else {
            stack[stack.length - 1].node.children.push(node);
        }

        stack.push({ indent, node });
    }
    return rootNodes;
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

        let attrs = `role="${node.role}"`;
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
            // Don't render /url as individual sub-elements if handled already
            const validChildren = node.children.filter(c => c.role !== '/url');

            if (node.text) inner += node.text;

            if (validChildren.length > 0) {
                inner += '\n' + ariaNodesToHtml(validChildren, indentLevel + 1) + `\n${indent}`;
            }
            html += `${inner}</${tag.split(' ')[0]}>`;
        }
        return html;
    }).join('\n');
}

const parsedTree = parseAriaTree(snapshot.tree);
console.log(ariaNodesToHtml(parsedTree));


await browser.close();


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