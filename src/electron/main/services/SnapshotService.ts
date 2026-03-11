import { executeCommand } from 'agent-browser/dist/actions.js';
import { BrowserManager } from 'agent-browser/dist/browser.js';
import type { Command, Response } from 'agent-browser/dist/types.js';
import { ariaToHtml } from '../../../AriaToHtml/AriaToHtml.js';
import type {
    CommandHistoryEntry,
    ExecuteMcpRequest,
    McpCommand,
    LoadSnapshotRequest,
    OverlayHint,
    SnapshotRefs,
    SnapshotResponse
} from '../../shared/snapshot.js';
import { performance } from 'node:perf_hooks';

type SnapshotSession = {
    id: string;
    browser: BrowserManager;
    launched: boolean;
    commandHistory: CommandHistoryEntry[];
    overlayHints: OverlayHint[];
    nextCommandNumber: number;
};

type SessionSnapshot = {
    htmlPieces: string[];
    currentUrl: string;
    refs: SnapshotRefs;
};

type CommandExecutionResult = {
    historyEntry: CommandHistoryEntry;
    errorMessage?: string;
};

type RawOverlayHint = {
    id: string;
    kind: string;
    reason: string;
    confidence: string;
    closeActions: Array<{
        label: string;
        selector: string;
        confidence: string;
    }>;
    htmlSnippet?: string;
};

type OverlayDismissAttempt = {
    dismissed: boolean;
    selectors: string[];
};

type TimingData = Record<string, number>;

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const MAX_COMMAND_HISTORY = 200;
const DEFAULT_POST_WAIT_TIMEOUT_MS = 1500;
const DEFAULT_NAVIGATION_TIMEOUT_MS = 10000;
const OVERLAY_DISMISS_TIMEOUT_MS = 3000;
const OVERLAY_FRAME_SEARCH_TIMEOUT_MS = 250;
const OVERLAY_DISMISS_MAX_ATTEMPTS = 3;
const FALLBACK_OVERLAY_CLOSE_ACTIONS: OverlayHint['closeActions'] = [
    { label: 'Accept cookies', selector: 'button.fc-primary-button', confidence: 'low' },
    { label: 'Accept All', selector: 'button:has-text("Accept All")', confidence: 'low' },
    { label: 'Accept', selector: 'button:has-text("Accept")', confidence: 'low' },
    { label: 'Allow All', selector: 'button:has-text("Allow All")', confidence: 'low' },
    { label: 'Agree', selector: 'button:has-text("Agree")', confidence: 'low' },
    { label: 'Accept cookies', selector: '#onetrust-accept-btn-handler', confidence: 'low' },
    { label: 'Reject cookies', selector: '#onetrust-reject-all-handler', confidence: 'low' },
    { label: 'Close', selector: 'button[aria-label="Close"]', confidence: 'low' },
    { label: 'Dismiss', selector: 'button[title="Close"]', confidence: 'low' }
];

const sessions = new Map<string, SnapshotSession>();
let nextSessionId = 1;

function markTiming(timing: TimingData | undefined, key: string, startMs: number): void {
    if (!timing) return;
    timing[key] = Math.max(0, Math.round(performance.now() - startMs));
}

function setTimingValue(timing: TimingData | undefined, key: string, valueMs: number): void {
    if (!timing) return;
    timing[key] = Math.max(0, Math.round(valueMs));
}

function applyTimingToParams(params: Record<string, string | boolean>, timing: TimingData | undefined): void {
    if (!timing) return;
    for (const [key, value] of Object.entries(timing)) {
        params[`timing_${key}_ms`] = String(value);
    }
}

function logTiming(label: string, timing: TimingData | undefined, meta?: Record<string, string>): void {
    if (!timing) return;
    const parts: string[] = [];
    if (meta) {
        for (const [key, value] of Object.entries(meta)) {
            if (value) parts.push(`${key}=${value}`);
        }
    }
    const metaText = parts.length > 0 ? ` ${parts.join(' ')}` : '';
    const timings = Object.entries(timing)
        .map(([key, value]) => `${key}=${value}ms`)
        .join(' ');
    console.info(`[timing] ${label}${metaText} ${timings}`.trim());
}

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
        launched: false,
        commandHistory: [],
        overlayHints: [],
        nextCommandNumber: 1
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
        await session.browser.launch({
            action: 'launch',
            id: 'default',
            headless: true,
            userAgent: DEFAULT_USER_AGENT
        });
        session.launched = true;
    }

    await session.browser.ensurePage();
    try {
        const page = session.browser.getPage();
        page.setDefaultNavigationTimeout(DEFAULT_NAVIGATION_TIMEOUT_MS);
    } catch {
        // Ignore default navigation timeout errors.
    }
}

async function getSnapshotFromSession(session: SnapshotSession, timing?: TimingData): Promise<SessionSnapshot> {
    const snapshotStart = performance.now();
    const snapshot = await session.browser.getSnapshot({});
    markTiming(timing, 'snapshot', snapshotStart);

    const renderStart = performance.now();
    const htmlPieces = ariaToHtml(snapshot.tree);
    markTiming(timing, 'aria_to_html', renderStart);
    const currentUrl = session.browser.getPage().url() || '';

    return {
        htmlPieces,
        currentUrl,
        refs: snapshot.refs
    };
}

function createBaseSnapshotResponse(options: {
    sessionId?: string;
    rawUrl?: string;
    targetUrl?: string;
    statusMessage: string;
    errorMessage: string;
    commandHistory?: CommandHistoryEntry[];
    overlayHints?: OverlayHint[];
}): SnapshotResponse {
    return {
        sessionId: options.sessionId,
        rawUrl: options.rawUrl || '',
        targetUrl: options.targetUrl,
        statusMessage: options.statusMessage,
        errorMessage: options.errorMessage,
        htmlPieces: [],
        refs: {},
        commandHistory: options.commandHistory || [],
        overlayHints: options.overlayHints || []
    };
}

async function buildSnapshotResponse(
    session: SnapshotSession,
    options: {
        rawUrl?: string;
        targetUrl?: string;
        statusMessage?: string;
        errorMessage?: string;
    },
    timing?: TimingData
): Promise<SnapshotResponse> {
    const buildStart = performance.now();
    const { htmlPieces, currentUrl, refs } = await getSnapshotFromSession(session, timing);
    markTiming(timing, 'build_snapshot', buildStart);
    const defaultStatus = currentUrl ? `Viewing ${currentUrl}` : 'Viewing current page';

    return {
        sessionId: session.id,
        rawUrl: options.rawUrl ?? currentUrl,
        targetUrl: currentUrl || options.targetUrl,
        statusMessage: options.statusMessage ?? defaultStatus,
        errorMessage: options.errorMessage ?? '',
        htmlPieces,
        refs,
        commandHistory: [...session.commandHistory],
        overlayHints: [...session.overlayHints]
    };
}

async function buildSnapshotResponseWithRetryOnEmpty(
    session: SnapshotSession,
    options: {
        rawUrl?: string;
        targetUrl?: string;
        statusMessage?: string;
        errorMessage?: string;
    },
    timing?: TimingData
): Promise<SnapshotResponse> {
    const initial = await buildSnapshotResponse(session, options, timing);
    if (initial.errorMessage || initial.htmlPieces.length > 0) {
        return initial;
    }

    try {
        const waitStart = performance.now();
        await session.browser.getPage().waitForLoadState('domcontentloaded', { timeout: 3000 });
        markTiming(timing, 'empty_retry_wait', waitStart);
        return await buildSnapshotResponse(session, options, timing);
    } catch {
        return initial;
    }
}

function normalizeSelector(selector: string): string {
    const trimmed = selector.trim();
    if (!trimmed) {
        throw new Error('Missing selector.');
    }

    if (/^@?e\d+$/i.test(trimmed)) {
        return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
    }

    return trimmed;
}

function nextCommandId(session: SnapshotSession): string {
    const id = `${session.id}-cmd-${session.nextCommandNumber}`;
    session.nextCommandNumber += 1;
    return id;
}

function toCommandLine(command: McpCommand): string {
    switch (command.action) {
        case 'open': {
            const alias = command.alias ?? 'open';
            return `agent-browser ${alias} ${command.url}`;
        }
        case 'click': {
            const withNewTab = command.newTab ? ' --new-tab' : '';
            return `agent-browser click ${command.selector}${withNewTab}`;
        }
        case 'dblclick':
            return `agent-browser dblclick ${command.selector}`;
        case 'focus':
            return `agent-browser focus ${command.selector}`;
    }
}

function toHistoryParams(command: McpCommand): Record<string, string | boolean> {
    switch (command.action) {
        case 'open':
            return {
                url: command.url,
                waitUntil: command.waitUntil ?? 'domcontentloaded'
            };
        case 'click':
            return {
                selector: command.selector,
                ...(command.newTab ? { newTab: true } : {})
            };
        case 'dblclick':
            return {
                selector: command.selector
            };
        case 'focus':
            return {
                selector: command.selector
            };
    }
}

function applyWaitForParams(command: McpCommand, params: Record<string, string | boolean>): void {
    if (!('waitFor' in command)) return;
    const waitFor = command.waitFor;
    if (!waitFor) return;

    params.waitFor = waitFor.type;
    if ('value' in waitFor && waitFor.value) {
        params.waitForValue = waitFor.value;
    }
    if ('timeoutMs' in waitFor && waitFor.timeoutMs) {
        params.waitForTimeoutMs = String(waitFor.timeoutMs);
    }
    if (waitFor.type === 'selector' && waitFor.state) {
        params.waitForState = waitFor.state;
    }
}

async function applyPostActionWait(
    session: SnapshotSession,
    command: McpCommand,
    params: Record<string, string | boolean>,
    timing?: TimingData
): Promise<void> {
    if (!('waitFor' in command)) return;
    const waitFor = command.waitFor;
    if (!waitFor || waitFor.type === 'none') return;

    const page = session.browser.getPage();
    const timeoutMs = 'timeoutMs' in waitFor && waitFor.timeoutMs
        ? waitFor.timeoutMs
        : DEFAULT_POST_WAIT_TIMEOUT_MS;

    params.waitForTimeoutMs = String(timeoutMs);

    const waitStart = performance.now();
    try {
        if (waitFor.type === 'domcontentloaded' || waitFor.type === 'load' || waitFor.type === 'networkidle') {
            await page.waitForLoadState(waitFor.type, { timeout: timeoutMs });
            return;
        }

        if (waitFor.type === 'url') {
            await page.waitForURL(waitFor.value, { timeout: timeoutMs });
            return;
        }

        if (waitFor.type === 'selector') {
            await page.waitForSelector(waitFor.value, {
                timeout: timeoutMs,
                state: waitFor.state ?? 'visible'
            });
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        params.waitForError = message;
    } finally {
        markTiming(timing, 'post_wait', waitStart);
    }
}

function toAgentBrowserCommand(session: SnapshotSession, command: McpCommand): McpCommand & { commandId: string; protocolCommand: Command } {
    const commandId = nextCommandId(session);

    switch (command.action) {
        case 'open': {
            const normalizedUrl = normalizeRequestedUrl(command.url);
            if (!normalizedUrl) {
                throw new Error('Invalid URL. Use http:// or https:// (or enter a hostname).');
            }

            const waitUntil = command.waitUntil ?? 'domcontentloaded';
            return {
                ...command,
                url: normalizedUrl,
                waitUntil,
                commandId,
                protocolCommand: {
                    id: commandId,
                    action: 'navigate',
                    url: normalizedUrl,
                    waitUntil
                }
            };
        }
        case 'click': {
            const selector = normalizeSelector(command.selector);
            return {
                ...command,
                selector,
                commandId,
                protocolCommand: {
                    id: commandId,
                    action: 'click',
                    selector,
                    ...(command.newTab ? { newTab: true } : {})
                }
            };
        }
        case 'dblclick': {
            const selector = normalizeSelector(command.selector);
            return {
                ...command,
                selector,
                commandId,
                protocolCommand: {
                    id: commandId,
                    action: 'dblclick',
                    selector
                }
            };
        }
        case 'focus': {
            const selector = normalizeSelector(command.selector);
            return {
                ...command,
                selector,
                commandId,
                protocolCommand: {
                    id: commandId,
                    action: 'focus',
                    selector
                }
            };
        }
    }
}

function appendCommandHistory(session: SnapshotSession, entry: CommandHistoryEntry): void {
    session.commandHistory.push(entry);
    if (session.commandHistory.length > MAX_COMMAND_HISTORY) {
        session.commandHistory.splice(0, session.commandHistory.length - MAX_COMMAND_HISTORY);
    }
}

function isRefSelector(selector: string): boolean {
    return /^@e\d+$/i.test(selector.trim());
}

function isStaleRefError(errorMessage: string): boolean {
    return /run ['"]snapshot['"]/i.test(errorMessage)
        || /matched \d+ elements/i.test(errorMessage)
        || /unsupported token "@e\d+"/i.test(errorMessage);
}

function shouldRetryCommandAfterSnapshotRefresh(command: McpCommand, errorMessage?: string): boolean {
    if (!errorMessage) return false;

    switch (command.action) {
        case 'click':
        case 'dblclick':
        case 'focus':
            return isRefSelector(command.selector) && isStaleRefError(errorMessage);
        default:
            return false;
    }
}

function normalizeOverlayKind(rawKind: string): OverlayHint['kind'] {
    const normalized = rawKind.toLowerCase();
    if (normalized === 'dialog') return 'dialog';
    if (normalized === 'cookie-banner' || normalized === 'cookie') return 'cookie-banner';
    return 'overlay';
}

function normalizeOverlayConfidence(rawConfidence: string): 'high' | 'medium' | 'low' {
    const normalized = rawConfidence.toLowerCase();
    if (normalized === 'high' || normalized === 'medium' || normalized === 'low') {
        return normalized;
    }
    return 'medium';
}

function isOverlayBlockingError(errorMessage: string): boolean {
    return /blocked by another element/i.test(errorMessage)
        || /modal/i.test(errorMessage)
        || /overlay/i.test(errorMessage)
        || /not interactable/i.test(errorMessage)
        || /may be blocked/i.test(errorMessage);
}

function shouldInspectOverlayForCommand(command: McpCommand, errorMessage?: string): boolean {
    if (!errorMessage) return false;
    if (!isOverlayBlockingError(errorMessage)) return false;

    switch (command.action) {
        case 'click':
        case 'dblclick':
        case 'focus':
            return true;
        default:
            return false;
    }
}

async function detectBlockingOverlayHints(session: SnapshotSession): Promise<OverlayHint[]> {
    const page = session.browser.getPage();
    const frames = page.frames();
    const allHints: OverlayHint[] = [];

    for (const frame of frames) {
        try {
            const rawHints = await frame.evaluate(() => {
                const runtime = globalThis as { document?: any; innerWidth?: number; innerHeight?: number; getComputedStyle?: (el: any) => any; CSS?: { escape?: (value: string) => string } };
                const doc = runtime.document;
                if (!doc?.body) return [] as RawOverlayHint[];

                const viewportWidth = Number(runtime.innerWidth || 0);
                const viewportHeight = Number(runtime.innerHeight || 0);
                if (viewportWidth <= 0 || viewportHeight <= 0) return [] as RawOverlayHint[];
                const viewportArea = viewportWidth * viewportHeight;

                const toArray = (value: any): any[] => Array.from(value || []);
                const trimText = (value: unknown): string => String(value || '').replace(/\s+/g, ' ').trim();
                const escapeAttr = (value: string): string => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                const escapeIdent = (value: string): string => {
                    if (runtime.CSS?.escape) return runtime.CSS.escape(value);
                    return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
                };

                const isVisible = (element: any): boolean => {
                    if (!element || typeof element.getBoundingClientRect !== 'function') return false;
                    const style = runtime.getComputedStyle?.(element);
                    if (!style) return false;
                    if (style.display === 'none' || style.visibility === 'hidden') return false;
                    if (Number(style.opacity || 1) <= 0.02) return false;

                    const rect = element.getBoundingClientRect();
                    // For iframes, we might be in a smaller coordinate system, so don't be too strict on viewport bounds if it's a subframe
                    return rect.width >= 6 && rect.height >= 6;
                };

                const uniqueSelector = (selector: string): boolean => {
                    if (!selector) return false;
                    try {
                        return doc.querySelectorAll(selector).length === 1;
                    } catch {
                        return false;
                    }
                };

                const buildSelector = (element: any): string => {
                    if (!element || !element.tagName) return '';

                    const tag = String(element.tagName).toLowerCase();
                    const id = trimText(element.id);
                    if (id) {
                        const byId = `#${escapeIdent(id)}`;
                        if (uniqueSelector(byId)) return byId;
                    }

                    const dataTestId = trimText(element.getAttribute?.('data-testid'));
                    if (dataTestId) {
                        const byTestId = `${tag}[data-testid="${escapeAttr(dataTestId)}"]`;
                        if (uniqueSelector(byTestId)) return byTestId;
                    }

                    const ariaLabel = trimText(element.getAttribute?.('aria-label'));
                    if (ariaLabel) {
                        const byAria = `${tag}[aria-label="${escapeAttr(ariaLabel)}"]`;
                        if (uniqueSelector(byAria)) return byAria;
                    }

                    const title = trimText(element.getAttribute?.('title'));
                    if (title) {
                        const byTitle = `${tag}[title="${escapeAttr(title)}"]`;
                        if (uniqueSelector(byTitle)) return byTitle;
                    }

                    const className = trimText(element.className).split(/\s+/).find((entry) => /^[a-zA-Z0-9_-]+$/.test(entry));
                    if (className) {
                        const byClass = `${tag}.${className}`;
                        if (uniqueSelector(byClass)) return byClass;
                    }

                    const parts: string[] = [];
                    let current = element;
                    for (let depth = 0; depth < 4 && current && current !== doc.body; depth += 1) {
                        let part = String(current.tagName || 'div').toLowerCase();
                        if (current.id) {
                            part += `#${escapeIdent(String(current.id))}`;
                            parts.unshift(part);
                            break;
                        }

                        const parent = current.parentElement;
                        if (parent) {
                            const siblings = toArray(parent.children).filter((candidate) => candidate.tagName === current.tagName);
                            if (siblings.length > 1) {
                                const index = siblings.indexOf(current);
                                if (index >= 0) {
                                    part += `:nth-of-type(${index + 1})`;
                                }
                            }
                        }

                        parts.unshift(part);
                        current = parent;
                    }

                    const byPath = parts.join(' > ');
                    if (uniqueSelector(byPath)) return byPath;
                    return '';
                };

                const elementLabel = (element: any): string => {
                    if (!element) return '';
                    if (element.tagName?.toLowerCase() === 'input') {
                        const inputLabel = trimText(element.value);
                        if (inputLabel) return inputLabel;
                    }
                    return trimText(
                        element.getAttribute?.('aria-label')
                        || element.getAttribute?.('title')
                        || element.textContent
                        || ''
                    );
                };

                const isLikelyOverlay = (element: any): boolean => {
                    if (!isVisible(element)) return false;

                    const style = runtime.getComputedStyle?.(element);
                    if (!style) return false;

                    const rect = element.getBoundingClientRect();
                    const areaRatio = (rect.width * rect.height) / viewportArea;
                    const zIndex = Number.parseInt(style.zIndex || '0', 10);
                    const role = String(element.getAttribute?.('role') || '').toLowerCase();
                    const ariaModal = String(element.getAttribute?.('aria-modal') || '').toLowerCase();
                    const tag = String(element.tagName || '').toLowerCase();
                    const namedText = `${element.id || ''} ${element.className || ''} ${elementLabel(element).slice(0, 140)}`.toLowerCase();
                    const cookieLike = /cookie|consent|privacy|gdpr|onetrust/.test(namedText);
                    const fixedLike = style.position === 'fixed' || style.position === 'sticky';
                    const modalLike = role === 'dialog' || ariaModal === 'true' || tag === 'dialog';
                    const largeFixed = fixedLike && (areaRatio >= 0.16 || (rect.width >= viewportWidth * 0.85 && rect.height >= 90));
                    const highLayer = zIndex >= 1000 && fixedLike;

                    // Support subframes by being more lenient if they are effectively full-screen within their frame
                    const isFullScreenInFrame = rect.width >= viewportWidth * 0.95 && rect.height >= viewportHeight * 0.95;

                    return modalLike || cookieLike || largeFixed || highLayer || isFullScreenInFrame;
                };

                const candidates = new Set<any>();
                const seededSelectors = '[role="dialog"], [aria-modal="true"], dialog[open], [id*="modal"], [class*="modal"], [id*="overlay"], [class*="overlay"], [id*="cookie"], [class*="cookie"], [id*="consent"], [class*="consent"], [id*="onetrust"], [class*="onetrust"]';
                for (const element of toArray(doc.querySelectorAll(seededSelectors))) {
                    if (isLikelyOverlay(element)) {
                        candidates.add(element);
                    }
                }

                const samplePoints: Array<[number, number]> = [
                    [Math.round(viewportWidth / 2), Math.round(viewportHeight / 2)],
                    [Math.round(viewportWidth / 2), Math.round(Math.min(96, viewportHeight / 3))],
                    [Math.round(viewportWidth / 2), Math.round(Math.max(16, viewportHeight - 96))]
                ];

                for (const [x, y] of samplePoints) {
                    if (typeof doc.elementsFromPoint !== 'function') continue;
                    const stack = toArray(doc.elementsFromPoint(x, y));
                    for (const element of stack) {
                        let current = element;
                        for (let depth = 0; current && depth < 5; depth += 1) {
                            if (isLikelyOverlay(current)) {
                                candidates.add(current);
                            }
                            current = current.parentElement;
                        }
                    }
                }

                const overlayRoots = toArray(candidates).sort((left, right) => {
                    const leftRect = left.getBoundingClientRect();
                    const rightRect = right.getBoundingClientRect();
                    return (rightRect.width * rightRect.height) - (leftRect.width * leftRect.height);
                });

                const dedupedRoots: any[] = [];
                for (const root of overlayRoots) {
                    if (dedupedRoots.some((existing) => existing === root || existing.contains(root))) {
                        continue;
                    }
                    for (let index = dedupedRoots.length - 1; index >= 0; index -= 1) {
                        if (root.contains(dedupedRoots[index])) {
                            dedupedRoots.splice(index, 1);
                        }
                    }
                    dedupedRoots.push(root);
                    if (dedupedRoots.length >= 3) break;
                }

                const closePattern = /(close|dismiss|accept|agree|allow|ok|got it|continue|reject|decline|no thanks|understand|x|×|✕)/i;

                const hints: RawOverlayHint[] = dedupedRoots.map((root, index) => {
                    const rect = root.getBoundingClientRect();
                    const areaRatio = Math.min(1, (rect.width * rect.height) / viewportArea);
                    const role = String(root.getAttribute?.('role') || '').toLowerCase();
                    const ariaModal = String(root.getAttribute?.('aria-modal') || '').toLowerCase();
                    const text = elementLabel(root).toLowerCase();
                    const classAndId = `${root.id || ''} ${root.className || ''}`.toLowerCase();
                    const cookieLike = /cookie|consent|privacy|gdpr|onetrust/.test(`${text} ${classAndId}`);
                    const kind = cookieLike ? 'cookie-banner' : (role === 'dialog' || ariaModal === 'true' ? 'dialog' : 'overlay');
                    const confidence = areaRatio >= 0.45 || kind === 'dialog'
                        ? 'high'
                        : areaRatio >= 0.2 || kind === 'cookie-banner'
                            ? 'medium'
                            : 'low';
                    const areaPercent = Math.max(1, Math.round(areaRatio * 100));

                    const reason = kind === 'cookie-banner'
                        ? `Possible cookie/consent banner covering ${areaPercent}% of the viewport.`
                        : `Possible blocking ${kind} covering ${areaPercent}% of the viewport.`;

                    const closeActions: RawOverlayHint['closeActions'] = [];
                    const seenSelectors = new Set<string>();
                    const closeCandidates = toArray(root.querySelectorAll('button, [role="button"], a, input[type="button"], input[type="submit"]'));

                    for (const candidate of closeCandidates) {
                        if (!isVisible(candidate)) continue;

                        const label = elementLabel(candidate).slice(0, 80);
                        const normalizedLabel = label.toLowerCase();
                        const candidateMeta = `${candidate.id || ''} ${candidate.className || ''}`.toLowerCase();
                        const closeLike = closePattern.test(normalizedLabel) || /close|dismiss|consent|cookie|onetrust/.test(candidateMeta);
                        if (!closeLike) continue;

                        const selector = buildSelector(candidate);
                        if (!selector || seenSelectors.has(selector)) continue;
                        seenSelectors.add(selector);

                        closeActions.push({
                            label: label || 'Close overlay',
                            selector,
                            confidence: /close|dismiss|reject/.test(normalizedLabel) ? 'high' : 'medium'
                        });
                        if (closeActions.length >= 5) break;
                    }

                    return {
                        id: `overlay-${index + 1}`,
                        kind,
                        reason,
                        confidence,
                        closeActions,
                        htmlSnippet: trimText(root.outerHTML).slice(0, 900)
                    };
                });

                return hints;
            });

            const frameHints = rawHints
                .map((hint): OverlayHint => ({
                    id: hint.id || `overlay-${Math.random().toString(36).slice(2, 8)}`,
                    kind: normalizeOverlayKind(hint.kind || 'overlay'),
                    reason: hint.reason || 'Possible blocking overlay detected.',
                    confidence: normalizeOverlayConfidence(hint.confidence || 'medium'),
                    closeActions: Array.isArray(hint.closeActions)
                        ? hint.closeActions
                            .filter((candidate) => candidate && typeof candidate.selector === 'string' && candidate.selector.trim().length > 0)
                            .map((candidate) => ({
                                label: candidate.label || 'Close overlay',
                                selector: candidate.selector,
                                confidence: normalizeOverlayConfidence(candidate.confidence || 'medium')
                            }))
                        : [],
                    htmlSnippet: typeof hint.htmlSnippet === 'string' ? hint.htmlSnippet : undefined
                }));
            
            allHints.push(...frameHints);
        } catch {
            // Ignore errors in specific frames
        }
    }

    // Deduplicate and return top 3
    return allHints
        .sort((a, b) => {
            const confOrder = { high: 0, medium: 1, low: 2 };
            return confOrder[a.confidence] - confOrder[b.confidence];
        })
        .slice(0, 3);
}

async function getPageDomSnippet(session: SnapshotSession): Promise<string | undefined> {
    try {
        const html = await session.browser.getPage().content();
        return html.replace(/\s+/g, ' ').slice(0, 1200);
    } catch {
        return undefined;
    }
}

async function tryDismissBlockingOverlay(session: SnapshotSession, commandId: string, hints: OverlayHint[]): Promise<OverlayDismissAttempt> {
    const selectors = new Set<string>();

    hints.forEach((hint) => {
        hint.closeActions.forEach((action) => {
            if (action.selector.trim()) {
                selectors.add(action.selector.trim());
            }
        });
    });

    // Common fallback selectors for cookie/modals in case no explicit close button was detected.
    selectors.add('#onetrust-accept-btn-handler');
    selectors.add('#onetrust-reject-all-handler');
    selectors.add('button.fc-primary-button');
    selectors.add('button.fc-cta-consent');
    selectors.add('button:has-text("Accept All")');
    selectors.add('button:has-text("Accept")');
    selectors.add('button:has-text("Allow All")');
    selectors.add('button:has-text("I Accept")');
    selectors.add('button:has-text("Agree")');
    selectors.add('button:has-text("I Agree")');
    selectors.add('button[aria-label="Close"]');
    selectors.add('button[title="Close"]');

    const clickedSelectors: string[] = [];
    const page = session.browser.getPage();
    const maxAttempts = OVERLAY_DISMISS_MAX_ATTEMPTS;
    let attemptNumber = 1;

    for (const selector of selectors) {
        if (attemptNumber > maxAttempts) break;

        let clicked = false;
        
        // Try main frame first
        try {
            await page.locator(selector).first().click({
                timeout: OVERLAY_FRAME_SEARCH_TIMEOUT_MS,
                force: true
            });
            clicked = true;
        } catch {
            // Ignore main frame fail and try subframes
        }

        // Try all frames if not clicked yet
        if (!clicked) {
            for (const frame of page.frames()) {
                if (frame === page.mainFrame()) continue;
                try {
                    const loc = frame.locator(selector).first();
                    if (await loc.count() > 0) {
                        await loc.click({
                            timeout: OVERLAY_FRAME_SEARCH_TIMEOUT_MS,
                            force: true
                        });
                        clicked = true;
                        break;
                    }
                } catch {
                    // Ignore subframe fail
                }
            }
        }

        if (clicked && !clickedSelectors.includes(selector)) {
            clickedSelectors.push(selector);
            attemptNumber += 1;
        } else if (!clicked) {
            attemptNumber += 1;
        }
    }

    if (clickedSelectors.length > 0) {
        await session.browser.getPage().waitForTimeout(150).catch(() => undefined);
    }

    return {
        dismissed: clickedSelectors.length > 0,
        selectors: clickedSelectors
    };
}

async function executeSessionCommand(session: SnapshotSession, command: McpCommand, timing?: TimingData): Promise<CommandExecutionResult> {
    const mapped = toAgentBrowserCommand(session, command);
    const commandLine = toCommandLine(mapped);
    const params = toHistoryParams(mapped);
    applyWaitForParams(command, params);

    const executeStart = performance.now();
    let result: Response;
    
    // Check if this click is targeting an active overlay hint
    const isOverlayHintClick = mapped.action === 'click' && 
                               session.overlayHints.some(h => h.closeActions.some(a => a.selector === mapped.selector));

    if (isOverlayHintClick) {
        try {
            const page = session.browser.getPage();
            let clicked = false;
            
            // Try main frame first
            try {
                await page.locator(mapped.selector).first().click({
                    timeout: OVERLAY_FRAME_SEARCH_TIMEOUT_MS,
                    force: true
                });
                clicked = true;
            } catch {
                // Ignore main frame fail and try subframes
            }
            
            // Try all frames if not clicked yet
            if (!clicked) {
                for (const frame of page.frames()) {
                    if (frame === page.mainFrame()) continue;
                    try {
                        const loc = frame.locator(mapped.selector).first();
                        if (await loc.count() > 0) {
                            await loc.click({
                                timeout: OVERLAY_FRAME_SEARCH_TIMEOUT_MS,
                                force: true
                            });
                            clicked = true;
                            break;
                        }
                    } catch {
                        // Ignore subframe fail
                    }
                }
            }

            if (!clicked) {
                // Final fallback with full timeout
                await page.locator(mapped.selector).first().click({
                    timeout: OVERLAY_DISMISS_TIMEOUT_MS,
                    force: true
                });
                clicked = true;
            }

            // Give it a tiny moment to process
            await session.browser.getPage().waitForTimeout(150).catch(() => undefined);
            result = { success: true, id: mapped.commandId, data: { clicked: true, forced: true } } as Response;
        } catch (error) {
            result = { success: false, id: mapped.commandId, error: error instanceof Error ? error.message : String(error) } as Response;
        }
    } else {
        result = await executeCommand(mapped.protocolCommand, session.browser);
    }
    
    markTiming(timing, 'execute_command', executeStart);
    let retriedAfterSnapshot = false;

    if (!result.success && shouldRetryCommandAfterSnapshotRefresh(mapped, result.error)) {
        retriedAfterSnapshot = true;

        try {
            const retrySnapshotStart = performance.now();
            await session.browser.getSnapshot({});
            markTiming(timing, 'retry_snapshot', retrySnapshotStart);

            const retryExecuteStart = performance.now();
            result = await executeCommand(mapped.protocolCommand, session.browser);
            markTiming(timing, 'retry_execute_command', retryExecuteStart);
        } catch {
            // Ignore refresh errors and return the original command failure.
        }
    }

    if (retriedAfterSnapshot) {
        params.retryAfterSnapshot = true;
    }

    if (!result.success && shouldInspectOverlayForCommand(mapped, result.error)) {
        const overlayDetectStart = performance.now();
        let overlayHints = await detectBlockingOverlayHints(session);
        markTiming(timing, 'overlay_detect', overlayDetectStart);
        if (overlayHints.length === 0) {
            const snippetStart = performance.now();
            const htmlSnippet = await getPageDomSnippet(session);
            markTiming(timing, 'overlay_dom_snippet', snippetStart);
            overlayHints = [{
                id: 'overlay-fallback',
                kind: 'overlay',
                reason: 'Click may be blocked by a higher-layer element (modal, banner, or sticky header).',
                confidence: 'low',
                closeActions: [...FALLBACK_OVERLAY_CLOSE_ACTIONS],
                ...(htmlSnippet ? { htmlSnippet } : {})
            }];
        }
        overlayHints = overlayHints.map((hint) => {
            if (hint.closeActions.length > 0) return hint;
            return {
                ...hint,
                closeActions: [...FALLBACK_OVERLAY_CLOSE_ACTIONS]
            };
        });

        session.overlayHints = overlayHints;

        if (overlayHints.length > 0) {
            params.overlayHints = String(overlayHints.length);

            const dismissStart = performance.now();
            const dismissAttempt = await tryDismissBlockingOverlay(session, mapped.commandId, overlayHints);
            markTiming(timing, 'overlay_dismiss', dismissStart);
            if (dismissAttempt.dismissed) {
                params.overlayDismissed = true;
                params.overlayCloseSelectors = dismissAttempt.selectors.join(', ');
                const overlayExecuteStart = performance.now();
                result = await executeCommand(mapped.protocolCommand, session.browser);
                markTiming(timing, 'overlay_retry_execute', overlayExecuteStart);
            } else {
                params.overlayDismissed = false;
            }
        }
    }

    if (result.success) {
        session.overlayHints = [];
    }

    if (result.success) {
        await applyPostActionWait(session, command, params, timing);
    }

    const historyEntry: CommandHistoryEntry = {
        id: mapped.commandId,
        action: mapped.action,
        commandLine,
        params,
        status: result.success ? 'success' : 'error',
        errorMessage: result.success ? undefined : result.error,
        executedAt: new Date().toISOString()
    };

    appendCommandHistory(session, historyEntry);

    if (result.success) {
        return { historyEntry };
    }

    return {
        historyEntry,
        errorMessage: result.error
    };
}

function parseSessionId(raw: unknown): string {
    return typeof raw === 'string' ? raw.trim() : '';
}

function getSessionOrError(normalizedSessionId: string): SnapshotSession | null {
    if (!normalizedSessionId) {
        return null;
    }

    const session = sessions.get(normalizedSessionId);
    return session || null;
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
    const normalized = parseSessionId(sessionId);
    if (!normalized) {
        return createBaseSnapshotResponse({
            rawUrl: '',
            statusMessage: 'Failed to refresh snapshot.',
            errorMessage: 'Missing session id.'
        });
    }

    const session = getSessionOrError(normalized);
    if (!session) {
        return createBaseSnapshotResponse({
            sessionId: normalized,
            rawUrl: '',
            statusMessage: 'Failed to refresh snapshot.',
            errorMessage: 'Session expired. Reload the tab.'
        });
    }

    try {
        const timing: TimingData = {};
        const totalStart = performance.now();
        const ensureStart = performance.now();
        await ensureSessionReady(session);
        markTiming(timing, 'ensure_session', ensureStart);
        const response = await buildSnapshotResponse(session, {}, timing);
        setTimingValue(timing, 'total', performance.now() - totalStart);
        logTiming('refresh-snapshot', timing, { sessionId: session.id });
        return response;
    } catch (error) {
        return createBaseSnapshotResponse({
            sessionId: session.id,
            rawUrl: '',
            statusMessage: 'Failed to refresh snapshot.',
            errorMessage: error instanceof Error ? error.message : String(error),
            commandHistory: [...session.commandHistory],
            overlayHints: [...session.overlayHints]
        });
    }
}

export async function loadSnapshot(request: LoadSnapshotRequest): Promise<SnapshotResponse> {
    const rawUrl = typeof request.rawUrl === 'string' ? request.rawUrl : '';
    const sessionId = typeof request.sessionId === 'string' ? request.sessionId : undefined;
    const targetUrl = normalizeRequestedUrl(rawUrl);

    if (rawUrl && !targetUrl) {
        return createBaseSnapshotResponse({
            sessionId,
            rawUrl,
            statusMessage: 'Enter a valid URL and press Go.',
            errorMessage: 'Invalid URL. Use http:// or https:// (or enter a hostname).'
        });
    }

    if (!targetUrl) {
        return createBaseSnapshotResponse({
            sessionId,
            rawUrl,
            statusMessage: 'Enter a URL and press Go.',
            errorMessage: ''
        });
    }

    const session = getOrCreateSession(sessionId);

    try {
        const timing: TimingData = {};
        const totalStart = performance.now();
        const ensureStart = performance.now();
        await ensureSessionReady(session);
        markTiming(timing, 'ensure_session', ensureStart);
        const execution = await executeSessionCommand(session, {
            action: 'open',
            alias: 'open',
            url: targetUrl,
            waitUntil: 'domcontentloaded'
        }, timing);

        const responseBuilder = execution.errorMessage ? buildSnapshotResponse : buildSnapshotResponseWithRetryOnEmpty;
        const response = await responseBuilder(session, {
            rawUrl,
            targetUrl,
            statusMessage: execution.errorMessage ? `Failed to load ${targetUrl}` : `Viewing ${targetUrl}`,
            errorMessage: execution.errorMessage || ''
        }, timing);
        setTimingValue(timing, 'total', performance.now() - totalStart);
        applyTimingToParams(execution.historyEntry.params, timing);
        logTiming('load-snapshot', timing, { sessionId: session.id, url: targetUrl });
        return response;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        try {
            return await buildSnapshotResponse(session, {
                rawUrl,
                targetUrl,
                statusMessage: `Failed to load ${targetUrl}`,
                errorMessage: message
            });
        } catch {
            return createBaseSnapshotResponse({
                sessionId: session.id,
                rawUrl,
                targetUrl,
                statusMessage: `Failed to load ${targetUrl}`,
                errorMessage: message,
                commandHistory: [...session.commandHistory],
                overlayHints: [...session.overlayHints]
            });
        }
    }
}

export async function executeMcpCommand(request: ExecuteMcpRequest): Promise<SnapshotResponse> {
    const normalized = parseSessionId(request.sessionId);
    if (!normalized) {
        return createBaseSnapshotResponse({
            rawUrl: '',
            statusMessage: 'Failed to execute MCP command.',
            errorMessage: 'Missing session id.'
        });
    }

    const session = getSessionOrError(normalized);
    if (!session) {
        return createBaseSnapshotResponse({
            sessionId: normalized,
            rawUrl: '',
            statusMessage: 'Failed to execute MCP command.',
            errorMessage: 'Session expired. Reload the tab.'
        });
    }

    try {
        const timing: TimingData = {};
        const totalStart = performance.now();
        const ensureStart = performance.now();
        await ensureSessionReady(session);
        markTiming(timing, 'ensure_session', ensureStart);
        const execution = await executeSessionCommand(session, request.command, timing);

        const responseBuilder = execution.errorMessage ? buildSnapshotResponse : buildSnapshotResponseWithRetryOnEmpty;
        const response = await responseBuilder(session, {
            statusMessage: execution.errorMessage
                ? `Failed: ${execution.historyEntry.commandLine}`
                : `Executed ${execution.historyEntry.commandLine}`,
            errorMessage: execution.errorMessage || ''
        }, timing);
        setTimingValue(timing, 'total', performance.now() - totalStart);
        applyTimingToParams(execution.historyEntry.params, timing);
        logTiming('execute-mcp', timing, { sessionId: session.id, command: execution.historyEntry.commandLine });
        return response;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        try {
            return await buildSnapshotResponse(session, {
                statusMessage: 'Failed to execute MCP command.',
                errorMessage: message
            });
        } catch {
            return createBaseSnapshotResponse({
                sessionId: session.id,
                rawUrl: '',
                statusMessage: 'Failed to execute MCP command.',
                errorMessage: message,
                commandHistory: [...session.commandHistory],
                overlayHints: [...session.overlayHints]
            });
        }
    }
}
