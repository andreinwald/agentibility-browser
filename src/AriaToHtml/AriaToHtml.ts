import { nodesToHtml } from './NodesToHtml';
import { yamlToNodes } from './YamlToNodes';


export function ariaToHtml(ariaYaml: string): string {
    const ariaNodes = yamlToNodes(ariaYaml);
    return nodesToHtml(ariaNodes);
}




