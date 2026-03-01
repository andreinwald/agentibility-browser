import { nodesToHtml } from './NodesToHtml';
import { yamlToNodes } from './YamlToNodes';


export function ariaToHtml(ariaYaml: string): string[] {
    const ariaNodes = yamlToNodes(ariaYaml);
    return ariaNodes
        .map((node) => nodesToHtml([node]).trim())
        .filter((html) => html.length > 0);
}
