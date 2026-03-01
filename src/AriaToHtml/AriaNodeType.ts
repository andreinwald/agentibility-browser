export type AriaNode = {
    role: string;
    name?: string;
    attributes: Record<string, string>;
    children: AriaNode[];
    text?: string;
}