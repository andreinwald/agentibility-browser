import { type AriaNode } from "./AriaNodeType";

export function ariaNodesToHtml(nodes: AriaNode[], indentLevel = 0): string {
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