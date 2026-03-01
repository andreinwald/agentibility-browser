import { type AriaNode } from "./AriaNodeType.js";

export function nodesToHtml(nodes: AriaNode[], indentLevel = 0, parentNode?: AriaNode): string {
    const indent = '  '.repeat(indentLevel);
    return nodes
        .map((node) => nodeToHtml(node, indentLevel, parentNode))
        .filter(Boolean)
        .join('\n');
}

function nodeToHtml(node: AriaNode, indentLevel: number, parentNode?: AriaNode): string {
    if (node.role === '/url' || node.role === '/placeholder') return '';

    const indent = '  '.repeat(indentLevel);
    const tag = roleToTag(node);
    const children = node.children.filter((child) => child.role !== '/url' && child.role !== '/placeholder');
    const renderedChildren = renderChildren(node, children, indentLevel + 1);
    const primaryText = getPrimaryText(node);
    const hasChildren = renderedChildren.trim().length > 0;
    const attrs = buildAttributes(node, tag, indentLevel, parentNode);
    const hasValue = primaryText.length > 0 || hasChildren;

    if (shouldRenderAsCodeBlock(tag, primaryText)) {
        const codeAttrs = buildAttributes(node, 'pre', indentLevel, parentNode);
        return `${indent}<pre${codeAttrs}><code>${escapeHtml(primaryText)}</code></pre>`;
    }

    if (!hasValue && shouldDropEmptyTag(node, tag)) {
        return '';
    }

    if (!hasValue && isNoiseContainer(node, tag)) {
        return '';
    }

    const isVoid = ['img', 'input'].includes(tag);
    if (isVoid) {
        return `${indent}<${tag}${attrs} />`;
    }

    const innerParts: string[] = [];
    if (primaryText) {
        innerParts.push(escapeHtml(primaryText));
    }
    if (hasChildren) {
        innerParts.push(renderedChildren);
    }

    if (innerParts.length === 0) {
        return `${indent}<${tag}${attrs}></${tag}>`;
    }

    const inner = innerParts.join('\n');
    if (inner.includes('\n')) {
        return `${indent}<${tag}${attrs}>\n${inner}\n${indent}</${tag}>`;
    }
    return `${indent}<${tag}${attrs}>${inner}</${tag}>`;
}

function renderChildren(parent: AriaNode, children: AriaNode[], indentLevel: number): string {
    if (children.length === 0) return '';

    if (parent.role === 'list') {
        const normalizedChildren = normalizeListChildren(children);
        return nodesToHtml(normalizedChildren, indentLevel, parent);
    }

    return nodesToHtml(children, indentLevel, parent);
}

function roleToTag(node: AriaNode): string {
    switch (node.role) {
        case 'banner':
            return 'header';
        case 'main':
            return 'main';
        case 'navigation':
            return 'nav';
        case 'contentinfo':
            return 'footer';
        case 'complementary':
            return 'aside';
        case 'form':
            return 'form';
        case 'section':
        case 'region':
            return 'section';
        case 'link':
            return 'a';
        case 'button':
            return 'button';
        case 'img':
            return 'img';
        case 'heading': {
            const level = Math.max(1, Math.min(6, Number(node.attributes.level || '1')));
            return `h${level}`;
        }
        case 'paragraph':
            return 'p';
        case 'text':
            return 'span';
        case 'strong':
            return 'strong';
        case 'list':
            return 'ul';
        case 'listitem':
            return 'li';
        case 'table':
            return 'table';
        case 'rowgroup':
            return 'tbody';
        case 'row':
            return 'tr';
        case 'columnheader':
            return 'th';
        case 'cell':
            return 'td';
        case 'textbox':
        case 'searchbox':
            return 'input';
        case 'checkbox':
            return 'input';
        case 'radio':
            return 'input';
        case 'combobox':
            return 'select';
        case 'option':
            return 'option';
        case 'progressbar':
            return 'progress';
        default:
            return 'div';
    }
}

function buildAttributes(node: AriaNode, tag: string, indentLevel: number, parentNode?: AriaNode): string {
    const attrs: string[] = [];
    const urlNode = node.children.find((child) => child.role === '/url' && child.text);
    const placeholderNode = node.children.find((child) => child.role === '/placeholder' && child.text);
    const classes = getClassNames(node, tag, indentLevel, parentNode);

    if (classes.length > 0) {
        attrs.push(`class="${classes.join(' ')}"`);
    }

    if (tag === 'a' && urlNode?.text) {
        attrs.push(`href="${escapeAttr(urlNode.text)}"`);
    }
    if (tag === 'main') {
        attrs.push('id="start-of-content"');
    }
    if (tag === 'img' && node.name) {
        attrs.push(`alt="${escapeAttr(node.name)}"`);
    }
    if (tag === 'input') {
        if (node.role === 'checkbox') attrs.push('type="checkbox"');
        else if (node.role === 'radio') attrs.push('type="radio"');
        else attrs.push('type="text"');

        if (placeholderNode?.text) {
            attrs.push(`placeholder="${escapeAttr(placeholderNode.text)}"`);
        }
    }
    if (tag === 'option' && node.attributes.selected === 'true') {
        attrs.push('selected');
    }
    if (tag === 'th') {
        attrs.push('scope="col"');
    }

    if (node.name && !shouldRenderNameAsText(node)) {
        attrs.push(`aria-label="${escapeAttr(node.name)}"`);
    }

    for (const [k, v] of Object.entries(node.attributes)) {
        if (k === 'level' || k === 'selected') continue;
        attrs.push(`data-${escapeAttr(k)}="${escapeAttr(v)}"`);
    }

    if (tag === 'div') {
        attrs.push(`data-depth="${String(indentLevel)}"`);
        attrs.push(`data-role="${escapeAttr(node.role)}"`);
    }

    return attrs.length > 0 ? ` ${attrs.join(' ')}` : '';
}

function getClassNames(node: AriaNode, tag: string, indentLevel: number, parentNode?: AriaNode): string[] {
    const classes = ['ax-node'];
    const listClasses = tag === 'ul' ? getListClasses(node, parentNode) : [];

    if (node.role === 'document') {
        classes.push('min-h-screen', 'bg-background', 'text-foreground');
    }

    switch (tag) {
        case 'header':
            classes.push(
                'ax-header',
                'ax-center',
                'mx-auto',
                'w-full',
                'max-w-6xl',
                'px-4',
                'py-3',
                'border-b',
                'border-border',
                'bg-background/95',
                'backdrop-blur',
                'flex',
                'flex-wrap',
                'items-center',
                'justify-center',
                'gap-3'
            );
            break;
        case 'main':
            classes.push('ax-main', 'ax-center', 'mx-auto', 'w-full', 'max-w-6xl', 'px-4', 'py-6', 'space-y-4');
            break;
        case 'footer':
            classes.push('ax-footer', 'ax-center', 'mx-auto', 'w-full', 'max-w-6xl', 'px-4', 'py-6', 'mt-8', 'border-t', 'border-border', 'space-y-4');
            break;
        case 'nav':
            classes.push('ax-nav', 'space-y-3');
            if (node.name?.toLowerCase() === 'main') classes.push('ax-nav-main');
            if (node.name?.toLowerCase().includes('directory')) {
                classes.push('ax-nav-directory', 'rounded-xl', 'border', 'border-border', 'bg-card', 'text-card-foreground', 'shadow-sm', 'p-4');
            }
            break;
        case 'section':
            classes.push('ax-section', 'rounded-lg', 'border', 'border-border', 'bg-card', 'text-card-foreground', 'shadow-sm', 'p-4', 'space-y-2');
            break;
        case 'ul':
            classes.push('ax-list', ...listClasses);
            if (listClasses.includes('ax-grid')) {
                classes.push('grid', 'gap-3', 'list-none', 'pl-0', 'my-2');
                if (listClasses.includes('ax-grid-4')) {
                    classes.push('grid-cols-2', 'md:grid-cols-3', 'xl:grid-cols-4');
                } else {
                    classes.push('grid-cols-1', 'sm:grid-cols-2', 'lg:grid-cols-3');
                }
            } else if (listClasses.includes('ax-list-inline')) {
                classes.push('list-none', 'pl-0', 'my-0', 'flex', 'flex-wrap', 'items-center', 'justify-center', 'gap-2');
            } else {
                classes.push('list-disc', 'pl-5', 'space-y-1.5', 'my-2');
            }
            break;
        case 'table':
            classes.push('w-full', 'border-collapse', 'text-sm', 'rounded-md', 'border', 'border-border', 'overflow-hidden');
            break;
        case 'tbody':
            classes.push('align-top');
            break;
        case 'tr':
            classes.push('border-b', 'border-border', 'hover:bg-muted/30');
            break;
        case 'th':
            classes.push('px-3', 'py-2', 'text-left', 'font-medium', 'bg-muted/50');
            break;
        case 'td':
            classes.push('px-3', 'py-2', 'align-top');
            break;
        case 'pre':
            classes.push(
                'ax-code',
                'my-2',
                'w-full',
                'overflow-x-auto',
                'rounded-md',
                'border',
                'border-border',
                'bg-muted/50',
                'p-3',
                'font-mono',
                'text-xs',
                'leading-relaxed',
                'whitespace-pre-wrap',
                'break-words',
                'text-foreground'
            );
            break;
        case 'li':
            classes.push('ax-item', 'leading-6');
            break;
        case 'a':
            classes.push('ax-link', 'text-foreground', 'underline-offset-4', 'hover:underline');
            break;
        case 'button':
            classes.push(
                'ax-button',
                'inline-flex',
                'items-center',
                'justify-center',
                'gap-2',
                'whitespace-nowrap',
                'rounded-md',
                'text-sm',
                'font-medium',
                'transition-colors',
                'h-9',
                'px-4',
                'py-2',
                'border',
                'border-input',
                'bg-background',
                'shadow-sm',
                'hover:bg-accent',
                'hover:text-accent-foreground'
            );
            break;
        case 'select':
            classes.push(
                'ax-select',
                'flex',
                'h-9',
                'w-full',
                'max-w-md',
                'rounded-md',
                'border',
                'border-input',
                'bg-background',
                'px-3',
                'py-2',
                'text-sm',
                'shadow-sm'
            );
            break;
        case 'input':
            classes.push(
                'ax-input',
                'flex',
                'h-9',
                'w-full',
                'max-w-md',
                'rounded-md',
                'border',
                'border-input',
                'bg-background',
                'px-3',
                'py-1',
                'text-sm',
                'shadow-sm',
                'placeholder:text-muted-foreground'
            );
            break;
        case 'p':
            classes.push('ax-paragraph', 'text-sm', 'leading-7', 'text-foreground/90');
            break;
        case 'span':
            classes.push('ax-text', 'text-sm', 'text-foreground/90');
            break;
        case 'strong':
            classes.push('ax-strong', 'font-semibold', 'text-foreground');
            break;
        default:
            if (tag.startsWith('h')) {
                classes.push('ax-heading', `ax-heading-${tag}`);
                if (tag === 'h1') classes.push('text-4xl', 'font-semibold', 'tracking-tight');
                if (tag === 'h2') classes.push('text-2xl', 'font-semibold', 'tracking-tight', 'pt-4');
                if (tag === 'h3') classes.push('text-xl', 'font-semibold', 'tracking-tight');
            }
            break;
    }

    if (tag === 'div') {
        classes.push(`ax-depth-${Math.min(indentLevel, 8)}`);
    }

    return classes;
}

function getListClasses(node: AriaNode, parentNode?: AriaNode): string[] {
    const items = normalizeListChildren(node.children.filter((child) => child.role !== '/url' && child.role !== '/placeholder'));
    const count = items.length;
    if (count === 0) return [];

    const imageHeavy = items.filter((item) => hasDescendantRole(item, 'img')).length / count >= 0.5;
    const linkHeavy = items.filter((item) => hasDescendantRole(item, 'link')).length / count >= 0.8;
    const actionHeavy = items.filter((item) => hasDescendantRole(item, 'link') || hasDescendantRole(item, 'button')).length / count >= 0.8;
    const textHeavy = items.filter((item) => hasTextualSignal(item)).length / count >= 0.5;

    const navName = parentNode?.name?.toLowerCase() || '';
    if (parentNode?.role === 'navigation' && actionHeavy && !imageHeavy && count >= 3 && count <= 12
        && (navName === 'main' || navName.includes('repository') || navName.includes('footer') || navName.includes('global'))) {
        return ['ax-list-inline'];
    }

    if (imageHeavy && !textHeavy && count >= 4) {
        return ['ax-grid', count >= 8 ? 'ax-grid-4' : 'ax-grid-3', 'ax-grid-media'];
    }

    if (linkHeavy && textHeavy && count >= 9) {
        return ['ax-grid', 'ax-grid-3', 'ax-grid-links'];
    }

    return [];
}

function normalizeListChildren(children: AriaNode[]): AriaNode[] {
    return children.map((child) => {
        if (child.role === 'listitem') return child;
        return {
            role: 'listitem',
            name: undefined,
            attributes: {},
            children: [child]
        } as AriaNode;
    });
}

function hasDescendantRole(node: AriaNode, role: string): boolean {
    if (node.role === role) return true;
    return node.children.some((child) => hasDescendantRole(child, role));
}

function hasTextualSignal(node: AriaNode): boolean {
    if (node.text && node.text.trim().length > 0) return true;
    if (['text', 'paragraph', 'strong', 'heading', 'button', 'option'].includes(node.role)) return true;
    return node.children.some((child) => hasTextualSignal(child));
}

function shouldRenderNameAsText(node: AriaNode): boolean {
    return ['heading', 'link', 'button', 'strong', 'option', 'columnheader'].includes(node.role);
}

function getPrimaryText(node: AriaNode): string {
    if (node.role === 'img' || node.role === 'main' || node.role === 'banner' || node.role === 'navigation') {
        return '';
    }

    if (node.text && node.text.trim()) {
        return node.text.trim();
    }

    if (node.name && shouldRenderNameAsText(node) && !hasTextualChildren(node)) {
        return node.name.trim();
    }

    return '';
}

function isNoiseContainer(node: AriaNode, tag: string): boolean {
    if (tag !== 'div') return false;
    if (node.attributes.ref) return false;
    return true;
}

function shouldDropEmptyTag(node: AriaNode, tag: string): boolean {
    if (tag === 'img') {
        return !node.name;
    }

    return ['header', 'main', 'nav', 'footer', 'aside', 'form', 'section', 'ul', 'li', 'p', 'span', 'strong', 'a', 'option', 'select', 'progress'].includes(tag);
}

function hasTextualChildren(node: AriaNode): boolean {
    return node.children.some((child) => {
        if (child.role === '/url' || child.role === '/placeholder') return false;
        if (child.text && child.text.trim()) return true;
        return ['text', 'paragraph', 'strong', 'heading', 'option'].includes(child.role);
    });
}

function escapeHtml(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeAttr(input: string): string {
    return escapeHtml(input).replace(/"/g, '&quot;');
}

function shouldRenderAsCodeBlock(tag: string, text: string): boolean {
    if ((tag !== 'span' && tag !== 'p') || !text) return false;
    if (text.length < 80) return false;

    const hints = ['=>', '{', '}', '(', ')', ':', '[', ']', '`'];
    const hintCount = hints.reduce((acc, hint) => acc + (text.includes(hint) ? 1 : 0), 0);
    if (hintCount < 5) return false;

    return ['function', 'return', 'const ', 'let ', 'import ', 'export ', 'use'].some((token) => text.includes(token));
}
