import { type AriaNode } from "./AriaNodeType";
import * as yaml from 'js-yaml';

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

export function parseAriaYaml(treeStr: string): AriaNode[] {
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
