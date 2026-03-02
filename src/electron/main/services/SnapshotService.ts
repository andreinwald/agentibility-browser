import { BrowserManager } from 'agent-browser/dist/browser.js';
import { ariaToHtml } from '../../../AriaToHtml/AriaToHtml.js';
import type { LoadSnapshotRequest, SnapshotResponse } from '../../shared/snapshot.js';

type SnapshotSession = {
    id: string;
    browser: BrowserManager;
    launched: boolean;
};

const sessions = new Map<string, SnapshotSession>();
let nextSessionId = 1;

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

function createSession(preferredId?: string): SnapshotSession {
    const requestedId = typeof preferredId === 'string' ? preferredId.trim() : '';
    if (requestedId && sessions.has(requestedId)) {
        return sessions.get(requestedId)!;
    }

    let id = requestedId || `session-${nextSessionId}`;
    while (sessions.has(id)) {
        nextSessionId += 1;
        id = `session-${nextSessionId}`;
    }

    if (!requestedId) {
        nextSessionId += 1;
    }

    const session: SnapshotSession = {
        id,
        browser: new BrowserManager(),
        launched: false
    };

    sessions.set(id, session);

    return session;
}

function getOrCreateSession(sessionId?: string): SnapshotSession {
    const normalized = typeof sessionId === 'string' ? sessionId.trim() : '';
    if (normalized) {
        const existing = sessions.get(normalized);
        if (existing) return existing;
        return createSession(normalized);
    }

    return createSession();
}

async function ensureSessionReady(session: SnapshotSession): Promise<void> {
    if (!session.launched) {
        await session.browser.launch({ action: 'launch', id: 'default', headless: true });
        session.launched = true;
    }

    await session.browser.ensurePage();
}

async function getSnapshotFromSession(session: SnapshotSession): Promise<{ htmlPieces: string[]; currentUrl: string }> {
    const snapshot = await session.browser.getSnapshot({});
    const htmlPieces = ariaToHtml(snapshot.tree);
    const currentUrl = session.browser.getPage().url() || '';

    return { htmlPieces, currentUrl };
}

type InitialNavigationStage = 'commit' | 'domcontentloaded';

async function navigateForInitialSnapshot(session: SnapshotSession, targetUrl: string): Promise<InitialNavigationStage> {
    const page = session.browser.getPage();

    // Stage 1: wait only for initial response commit to return quickly.
    await page.goto(targetUrl, { waitUntil: 'commit', timeout: 15000 });

    // Stage 2: briefly wait for DOM to become available, but do not block too long.
    try {
        await page.waitForLoadState('domcontentloaded', { timeout: 500 });
        return 'domcontentloaded';
    } catch {
        return 'commit';
    }
}

export async function closeSnapshotSession(sessionId: string): Promise<void> {
    const normalized = sessionId.trim();
    if (!normalized) return;

    const session = sessions.get(normalized);
    if (!session) return;

    sessions.delete(normalized);

    if (session.launched) {
        await session.browser.close().catch(() => undefined);
    }
}

export async function closeAllSnapshotSessions(): Promise<void> {
    const sessionIds = Array.from(sessions.keys());
    await Promise.all(sessionIds.map((sessionId) => closeSnapshotSession(sessionId)));
}

export async function refreshSnapshot(sessionId: string): Promise<SnapshotResponse> {
    const normalized = typeof sessionId === 'string' ? sessionId.trim() : '';
    if (!normalized) {
        return {
            rawUrl: '',
            statusMessage: 'Failed to refresh snapshot.',
            errorMessage: 'Missing session id.',
            htmlPieces: []
        };
    }

    const session = sessions.get(normalized);
    if (!session) {
        return {
            sessionId: normalized,
            rawUrl: '',
            statusMessage: 'Failed to refresh snapshot.',
            errorMessage: 'Session expired. Reload the tab.',
            htmlPieces: []
        };
    }

    try {
        await ensureSessionReady(session);
        const { htmlPieces, currentUrl } = await getSnapshotFromSession(session);

        return {
            sessionId: session.id,
            rawUrl: currentUrl,
            targetUrl: currentUrl || undefined,
            statusMessage: currentUrl ? `Viewing ${currentUrl}` : 'Viewing current page',
            errorMessage: '',
            htmlPieces
        };
    } catch (error) {
        return {
            sessionId: session.id,
            rawUrl: '',
            statusMessage: 'Failed to refresh snapshot.',
            errorMessage: error instanceof Error ? error.message : String(error),
            htmlPieces: []
        };
    }
}

export async function loadSnapshot(request: LoadSnapshotRequest): Promise<SnapshotResponse> {
    const rawUrl = typeof request.rawUrl === 'string' ? request.rawUrl : '';
    const sessionId = typeof request.sessionId === 'string' ? request.sessionId : undefined;
    const targetUrl = normalizeRequestedUrl(rawUrl);

    if (rawUrl && !targetUrl) {
        return {
            sessionId,
            rawUrl,
            statusMessage: 'Enter a valid URL and press Go.',
            errorMessage: 'Invalid URL. Use http:// or https:// (or enter a hostname).',
            htmlPieces: []
        };
    }

    if (!targetUrl) {
        return {
            sessionId,
            rawUrl,
            statusMessage: 'Enter a URL and press Go.',
            errorMessage: '',
            htmlPieces: []
        };
    }

    const session = getOrCreateSession(sessionId);

    try {
        await ensureSessionReady(session);
        const initialStage = await navigateForInitialSnapshot(session, targetUrl);

        const { htmlPieces, currentUrl } = await getSnapshotFromSession(session);
        const resolvedUrl = currentUrl || targetUrl;
        const statusMessage = initialStage === 'domcontentloaded'
            ? `Viewing ${resolvedUrl}`
            : `Initial snapshot for ${resolvedUrl} (page still loading)`;

        return {
            sessionId: session.id,
            rawUrl,
            targetUrl: resolvedUrl,
            statusMessage,
            errorMessage: '',
            htmlPieces
        };
    } catch (error) {
        return {
            sessionId: session.id,
            rawUrl,
            targetUrl,
            statusMessage: `Failed to load ${targetUrl}`,
            errorMessage: error instanceof Error ? error.message : String(error),
            htmlPieces: []
        };
    }
}
