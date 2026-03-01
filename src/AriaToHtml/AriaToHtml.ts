import { nodesToHtml } from './NodesToHtml';
import { yamlToNodes } from './YamlToNodes';
import { type AriaNode } from './AriaNodeType';


export function ariaToHtml(ariaYaml: string): string[] {
    const ariaNodes = yamlToNodes(ariaYaml);
    const significantNodes = flattenSignificantNodes(ariaNodes);

    return significantNodes
        .map((node) => nodeToHtmlShallow(node).trim())
        .filter((html) => html.length > 0);
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
