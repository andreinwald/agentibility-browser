import { type AriaNode } from "./AriaNodeType";

export function nodesToHtml(nodes: AriaNode[], indentLevel = 0): string {
    const indent = '  '.repeat(indentLevel);
    return nodes.map(node => {
        if (node.role === 'paragraph' || node.role === 'text') {
            let content = node.text ?? '';
            const validChildren = node.children.filter(c => c.role !== '/url');
            if (validChildren.length > 0) {
                const childHtml = nodesToHtml(validChildren, indentLevel);
                if (content && childHtml) {
                    content += '\n' + childHtml;
                } else if (childHtml) {
                    content = childHtml;
                }
            }
            return content;
        }

        let tag = 'div';
        if (node.role === 'link') tag = 'a';
        else if (node.role === 'button') tag = 'button';
        else if (node.role === 'img') tag = 'img';
        else if (node.role === 'heading') tag = node.attributes.level ? `h${node.attributes.level}` : 'h1';
        else if (node.role === 'list') tag = 'ul';
        else if (node.role === 'listitem') tag = 'li';
        else if (node.role === 'textbox' || node.role === 'searchbox') tag = 'input';
        else if (node.role === 'checkbox') tag = 'input type="checkbox"';
        else if (node.role === 'radio') tag = 'input type="radio"';

        const validChildren = node.children.filter(c => c.role !== '/url');
        let attrs = ``;
        // if (node.role) attrs += `role="${node.role}" `;

        // if (node.name) {
        //     attrs += ` aria-label="${node.name.replace(/"/g, '&quot;')}"`;
        // }

        // Handle /url child nodes for links
        if (node.role === 'link' && node.children.some(c => c.role === '/url')) {
            const urlNode = node.children.find(c => c.role === '/url');
            if (urlNode && urlNode.text) {
                attrs += ` href="${urlNode.text.replace(/"/g, '&quot;')}"`;
            }
        }

        // Preserve accessible name for images as alt text.
        if (node.role === 'img' && node.name) {
            attrs += ` alt="${node.name.replace(/"/g, '&quot;')}"`;
        }

        for (const [k, v] of Object.entries(node.attributes)) {
            if (k === 'level' && node.role === 'heading') continue; // Handled in tag
            attrs += ` data-${k}="${v.replace(/"/g, '&quot;')}"`;
        }

        const tagName = tag.split(' ')[0];
        const isVoid = ['img', 'input'].includes(tagName);
        const renderedChildren = validChildren.length > 0 ? nodesToHtml(validChildren, indentLevel + 1) : '';
        const hasValue = Boolean((node.name && node.name.trim()) || (node.text && node.text.trim()));
        const hasAttributes = attrs.trim().length > 0;
        const hasChildren = renderedChildren.trim().length > 0;

        // Drop visual noise placeholders.
        if ((tagName === 'div' || tagName === 'img') && !hasAttributes && !hasValue && !hasChildren) {
            return '';
        }

        let html = `${indent}<${tag}${attrs}${isVoid ? ' />' : '>'}`;

        if (!isVoid) {
            let inner = '';
            // For headings, use name as visible text.
            // For links, only fallback to name when there is no explicit content.
            const shouldRenderLinkName = node.role === 'link'
                && Boolean(node.name)
                && !node.text
                && validChildren.length === 0;
            const shouldRenderButtonName = node.role === 'button'
                && Boolean(node.name)
                && !node.text
                && validChildren.length === 0;
            if ((node.role === 'heading' || shouldRenderLinkName || shouldRenderButtonName) && node.name) {
                inner += node.name;
            }

            // Don't render /url as individual sub-elements if handled already

            if (node.text) inner += node.text;

            if (hasChildren) {
                inner += '\n' + renderedChildren + `\n${indent}`;
            }
            html += `${inner}</${tag.split(' ')[0]}>`;
        }
        return html;
    }).filter(Boolean).join('\n');
}
