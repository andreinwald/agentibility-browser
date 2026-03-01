import { nodesToHtml } from './NodesToHtml';
import { yamlToNodes } from './YamlToNodes';
import { type AriaNode } from './AriaNodeType';
import * as yaml from 'js-yaml';


export function ariaToHtml(ariaYaml: string): string {
    const ariaNodes = yamlToNodes(ariaYaml);
    const significantNodes = flattenSignificantNodes(ariaNodes);

    const rows = significantNodes.map((node) => {
        const yamlSnippet = escapeHtml(nodeToYamlShallow(node));
        const htmlSnippet = nodeToHtmlShallow(node);
        if (htmlSnippet.trim().length === 0) {
            return '';
        }
        const htmlCodeSnippet = escapeHtml(htmlSnippet);
        return `<tr>
  <td style="vertical-align: top; border: 1px solid #ddd; padding: 8px;"><pre style="margin: 0; white-space: pre-wrap;">${yamlSnippet}</pre></td>
  <td style="vertical-align: top; border: 1px solid #ddd; padding: 8px;"><pre style="margin: 0; white-space: pre-wrap;">${htmlCodeSnippet}</pre></td>
  <td style="vertical-align: top; border: 1px solid #ddd; padding: 8px;">${htmlSnippet}</td>
</tr>`;
    }).filter(Boolean).join('\n');

    return `<table style="width: 100%; border-collapse: collapse; font-family: monospace;">
  <thead>
    <tr>
      <th style="text-align: left; border: 1px solid #ddd; padding: 8px;">Original YAML</th>
      <th style="text-align: left; border: 1px solid #ddd; padding: 8px;">Generated HTML (Code)</th>
      <th style="text-align: left; border: 1px solid #ddd; padding: 8px;">Generated HTML (Rendered)</th>
    </tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>`;
}

function flattenSignificantNodes(nodes: AriaNode[]): AriaNode[] {
    const flattened: AriaNode[] = [];

    const visit = (node: AriaNode, parentRole?: string) => {
        if (parentRole && shouldInlineChild(parentRole, node.role)) {
            return;
        }

        if (node.role !== '/url') {
            flattened.push(node);
        }
        for (const child of node.children) {
            visit(child, node.role);
        }
    };

    for (const node of nodes) {
        visit(node);
    }

    return flattened;
}

function nodeToYamlShallow(node: AriaNode): string {
    const serialized = serializeNodeShallow(node);
    return yaml.dump([serialized], { noRefs: true, lineWidth: -1 }).trim();
}

function serializeNodeShallow(node: AriaNode): any {
    const key = buildNodeHeader(node);
    const directChildren = node.children.filter((child) => child.role !== '/url');
    const urlChildren = node.children.filter((child) => child.role === '/url');
    const inlineChildren = directChildren.filter((child) => shouldInlineChild(node.role, child.role));

    if (typeof node.text === 'string') {
        return { [key]: node.text };
    }

    if (urlChildren.length > 0 && directChildren.length === 0) {
        return { [key]: urlChildren.map((child) => serializeNodeShallow(child)) };
    }

    if (directChildren.length > 0) {
        if (inlineChildren.length === directChildren.length) {
            return {
                [key]: [
                    ...urlChildren.map((child) => serializeNodeShallow(child)),
                    ...inlineChildren.map((child) => serializeNodeShallow(child))
                ]
            };
        }

        const preview = directChildren.slice(0, 5).map((child) => buildNodeHeader(child));
        if (directChildren.length > preview.length) {
            preview.push(`... (${directChildren.length - preview.length} more children)`);
        }
        return { [key]: preview };
    }

    return key;
}

function buildNodeHeader(node: AriaNode): string {
    let header = node.role;

    if (node.name) {
        header += ` "${node.name}"`;
    }

    for (const [k, v] of Object.entries(node.attributes)) {
        header += ` [${k}=${v}]`;
    }

    return header;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function nodeToHtmlShallow(node: AriaNode): string {
    const urlChildren = node.children.filter((child) => child.role === '/url');
    const inlineChildren = node.children
        .filter((child) => shouldInlineChild(node.role, child.role))
        .map(toDisplayLeafNode);

    const clone: AriaNode = {
        role: node.role,
        name: node.name,
        attributes: { ...node.attributes },
        text: node.text,
        // Keep URL children and inline children so this row can represent one logical unit.
        children: [...urlChildren, ...inlineChildren]
    };

    return nodesToHtml([clone]);
}

function toDisplayLeafNode(node: AriaNode): AriaNode {
    return {
        role: node.role,
        name: node.name,
        attributes: { ...node.attributes },
        text: node.text,
        children: node.children.filter((child) => child.role === '/url')
    };
}

function shouldInlineChild(parentRole: string, childRole: string): boolean {
    if (parentRole === 'button' && (childRole === 'img' || childRole === 'text')) {
        return true;
    }

    if (parentRole === 'link' && (childRole === 'paragraph' || childRole === 'text')) {
        return true;
    }

    return false;
}
