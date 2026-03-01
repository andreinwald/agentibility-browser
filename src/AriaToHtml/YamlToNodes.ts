import { type AriaNode } from "./AriaNodeType";
import * as yaml from 'js-yaml';


export function yamlToNodes(treeStr: string): AriaNode[] {
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

function parseAriaNodeString(str: string): { role: string; name?: string; attributes: Record<string, string> } {
    const node: { role: string; name?: string; attributes: Record<string, string> } = {
        role: '',
        attributes: {}
    };

    const trimmed = str.trim();
    const firstSpace = trimmed.indexOf(' ');
    if (firstSpace === -1) {
        node.role = trimmed;
        return node;
    }

    node.role = trimmed.substring(0, firstSpace);
    let remaining = trimmed.substring(firstSpace + 1).trim();

    // Extract name in quotes with support for escaped quotes.
    if (remaining.startsWith('"')) {
        const parsed = readQuoted(remaining);
        if (parsed) {
            node.name = parsed.value;
            remaining = parsed.remaining;
        }
    }

    // Extract attributes [k=v] and valueless flags [selected].
    const attrPattern = /\[([^\]]+)\]/g;
    let match: RegExpExecArray | null;
    while ((match = attrPattern.exec(remaining)) !== null) {
        const raw = match[1].trim();
        if (!raw) continue;
        const separator = raw.indexOf('=');
        if (separator === -1) {
            node.attributes[raw] = 'true';
            continue;
        }

        const key = raw.substring(0, separator).trim();
        const value = raw.substring(separator + 1).trim();
        if (!key) continue;
        node.attributes[key] = value;
    }

    return node;
}

function readQuoted(input: string): { value: string; remaining: string } | null {
    if (!input.startsWith('"')) return null;

    let escaped = false;
    let out = '';
    for (let i = 1; i < input.length; i += 1) {
        const ch = input[i];
        if (escaped) {
            out += ch;
            escaped = false;
            continue;
        }
        if (ch === '\\') {
            escaped = true;
            continue;
        }
        if (ch === '"') {
            const remaining = input.substring(i + 1).trim();
            return { value: out, remaining };
        }
        out += ch;
    }

    return null;
}
