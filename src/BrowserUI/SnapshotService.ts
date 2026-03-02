import { BrowserManager } from 'agent-browser/dist/browser.js';
import { ariaToHtml } from '../AriaToHtml/AriaToHtml.js';

export type SnapshotResponse = {
    rawUrl: string;
    targetUrl?: string;
    statusMessage: string;
    errorMessage: string;
    htmlPieces: string[];
};

export function normalizeRequestedUrl(raw: string): string | undefined {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;

    let candidate = trimmed;
    if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(candidate)) {
        candidate = `https://${candidate}`;
    }

    try {
        const parsed = new URL(candidate);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return undefined;
        }
        return parsed.toString();
    } catch {
        return undefined;
    }
}

async function buildSnapshot(targetUrl: string): Promise<string[]> {
    const browser = new BrowserManager();
    let launched = false;

    try {
        await browser.launch({ action: 'launch', id: 'default', headless: true });
        launched = true;

        await browser.getPage().goto(targetUrl, { waitUntil: 'networkidle' });
        const snapshot = await browser.getSnapshot({});
        return ariaToHtml(snapshot.tree);
    } finally {
        if (launched) {
            await browser.close().catch(() => undefined);
        }
    }
}

export async function loadSnapshot(rawUrl: string): Promise<SnapshotResponse> {
    const targetUrl = normalizeRequestedUrl(rawUrl);

    if (rawUrl && !targetUrl) {
        return {
            rawUrl,
            statusMessage: 'Enter a valid URL and press Go.',
            errorMessage: 'Invalid URL. Use http:// or https:// (or enter a hostname).',
            htmlPieces: []
        };
    }

    if (!targetUrl) {
        return {
            rawUrl,
            statusMessage: 'Enter a URL and press Go.',
            errorMessage: '',
            htmlPieces: []
        };
    }

    try {
        const htmlPieces = await buildSnapshot(targetUrl);
        return {
            rawUrl,
            targetUrl,
            statusMessage: `Viewing ${targetUrl}`,
            errorMessage: '',
            htmlPieces
        };
    } catch (error) {
        return {
            rawUrl,
            targetUrl,
            statusMessage: `Failed to load ${targetUrl}`,
            errorMessage: error instanceof Error ? error.message : String(error),
            htmlPieces: []
        };
    }
}
