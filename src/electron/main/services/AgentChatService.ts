import { createOpenAI } from '@ai-sdk/openai';
import { generateText, stepCountIs, tool, zodSchema, type ModelMessage } from 'ai';
import { z } from 'zod';
import type { AgentChatRequest, AgentChatResponse, AgentChatToolEvent } from '../../shared/agentChat.js';
import type { OverlayHint, SnapshotRef, SnapshotRefs, SnapshotResponse } from '../../shared/snapshot.js';
import { executeMcpCommand, refreshSnapshot } from './SnapshotService.js';

type SnapshotSummary = {
    url: string;
    statusMessage: string;
    errorMessage: string;
    overlayHints: Array<{
        kind: OverlayHint['kind'];
        reason: string;
        confidence: OverlayHint['confidence'];
        closeActions: OverlayHint['closeActions'];
    }>;
    interactive: Array<{
        ref: string;
        role: string;
        name: string;
    }>;
    htmlPreview: string;
};

const DEFAULT_API_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_HISTORY_MESSAGES = 12;
const MAX_PROMPT_CHARS = 6_000;
const MAX_HTML_PREVIEW_CHARS = 6_000;
const MAX_INTERACTIVE_REFS = 80;
const MAX_OVERLAY_HINTS = 2;

const INTERACTIVE_ROLES = new Set<string>([
    'button',
    'link',
    'textbox',
    'searchbox',
    'combobox',
    'checkbox',
    'radio',
    'option',
    'menuitem',
    'tab',
    'switch',
    'slider',
    'spinbutton',
    'listbox',
    'treeitem'
]);

function truncate(value: string, maxChars: number): string {
    const normalized = value || '';
    if (normalized.length <= maxChars) return normalized;
    return `${normalized.slice(0, Math.max(0, maxChars - 16))}\n…[truncated]`;
}

function normalizeConfigValue(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function isInteractiveRef(ref: SnapshotRef): boolean {
    const role = String(ref.role || '').toLowerCase();
    if (INTERACTIVE_ROLES.has(role)) return true;
    return role.startsWith('menuitem');
}

function extractInteractiveRefs(refs: SnapshotRefs): SnapshotSummary['interactive'] {
    const items: SnapshotSummary['interactive'] = [];
    for (const [refId, ref] of Object.entries(refs || {})) {
        if (!ref || !isInteractiveRef(ref)) continue;
        const name = typeof ref.name === 'string' ? ref.name.trim() : '';
        items.push({
            ref: refId.startsWith('@') ? refId : `@${refId}`,
            role: String(ref.role || ''),
            name
        });
        if (items.length >= MAX_INTERACTIVE_REFS) break;
    }
    return items;
}

function summarizeSnapshotForAgent(snapshot: SnapshotResponse): SnapshotSummary {
    const url = snapshot.targetUrl || snapshot.rawUrl || '';
    const overlayHints = Array.isArray(snapshot.overlayHints)
        ? snapshot.overlayHints.slice(0, MAX_OVERLAY_HINTS).map((hint) => ({
            kind: hint.kind,
            reason: hint.reason,
            confidence: hint.confidence,
            closeActions: hint.closeActions
        }))
        : [];

    return {
        url,
        statusMessage: snapshot.statusMessage || '',
        errorMessage: snapshot.errorMessage || '',
        overlayHints,
        interactive: extractInteractiveRefs(snapshot.refs || {}),
        htmlPreview: truncate((snapshot.htmlPieces || []).join('\n'), MAX_HTML_PREVIEW_CHARS)
    };
}

function formatBrowserStateForPrompt(snapshot: SnapshotResponse): string {
    const summary = summarizeSnapshotForAgent(snapshot);
    const overlayText = summary.overlayHints.length > 0
        ? summary.overlayHints.map((hint, index) => {
            const actions = hint.closeActions.slice(0, 6).map((action) => `${action.label}: ${action.selector}`).join(' | ');
            return `${index + 1}. ${hint.kind} (${hint.confidence}) ${hint.reason}${actions ? `\n   closeActions: ${actions}` : ''}`;
        }).join('\n')
        : '(none)';

    const interactiveText = summary.interactive.length > 0
        ? summary.interactive.map((item) => `${item.ref} [${item.role}] ${item.name || '(no name)'}`).join('\n')
        : '(none)';

    const html = summary.htmlPreview ? summary.htmlPreview : '(empty)';

    return [
        'BROWSER_STATE (fresh snapshot):',
        `url: ${summary.url || '(none)'}`,
        `status: ${summary.statusMessage || '(none)'}`,
        `error: ${summary.errorMessage || '(none)'}`,
        `overlayHints:\n${overlayText}`,
        `interactiveRefs (use selector like @e123):\n${interactiveText}`,
        `snapshotHtml (truncated):\n${html}`
    ].join('\n');
}

function toModelMessages(history: AgentChatRequest['history']): ModelMessage[] {
    if (!Array.isArray(history) || history.length === 0) return [];

    const messages: ModelMessage[] = [];
    for (const entry of history.slice(-MAX_HISTORY_MESSAGES)) {
        if (!entry || typeof entry !== 'object') continue;
        if (entry.role !== 'user' && entry.role !== 'assistant') continue;
        const content = truncate(normalizeConfigValue(entry.content), MAX_PROMPT_CHARS);
        if (!content) continue;
        messages.push({ role: entry.role, content });
    }
    return messages;
}

export async function runAgentChat(request: AgentChatRequest): Promise<AgentChatResponse> {
    const sessionId = normalizeConfigValue(request.sessionId);
    if (!sessionId) {
        return {
            assistantMessage: 'Open a page first, then try again (no session id available).',
            toolEvents: [],
            snapshot: {
                rawUrl: '',
                statusMessage: 'No active session.',
                errorMessage: 'Missing session id.',
                htmlPieces: [],
                refs: {},
                commandHistory: [],
                overlayHints: []
            }
        };
    }

    const prompt = truncate(normalizeConfigValue(request.prompt), MAX_PROMPT_CHARS);
    if (!prompt) {
        const snapshot = await refreshSnapshot(sessionId);
        return {
            assistantMessage: 'Type a message to continue.',
            toolEvents: [],
            snapshot
        };
    }

    const apiKey = normalizeConfigValue(request.apiKey) || normalizeConfigValue(process.env.OPENAI_API_KEY);
    if (!apiKey) {
        const snapshot = await refreshSnapshot(sessionId);
        return {
            assistantMessage: 'Missing API key. Add it in the sidebar and retry.',
            toolEvents: [],
            snapshot
        };
    }

    const apiBaseUrl = normalizeConfigValue(request.apiBaseUrl) || normalizeConfigValue(process.env.OPENAI_BASE_URL) || DEFAULT_API_BASE_URL;
    const modelName = normalizeConfigValue(request.model) || normalizeConfigValue(process.env.OPENAI_MODEL) || DEFAULT_MODEL;

    const provider = createOpenAI({
        apiKey,
        baseURL: apiBaseUrl
    });

    const toolEvents: AgentChatToolEvent[] = [];
    let latestSnapshot = await refreshSnapshot(sessionId);

    const recordToolEvent = (event: AgentChatToolEvent): void => {
        toolEvents.push(event);
    };

    const tools = {
        snapshot: tool({
            description: 'Refresh the current page snapshot (ARIA) and return current interactive refs.',
            inputSchema: zodSchema(z.object({})),
            execute: async () => {
                const snapshot = await refreshSnapshot(sessionId);
                latestSnapshot = snapshot;
                const result = summarizeSnapshotForAgent(snapshot);
                recordToolEvent({ tool: 'snapshot', args: {}, result });
                return result;
            }
        }),
        open: tool({
            description: 'Navigate to a URL in the current browser session.',
            inputSchema: zodSchema(z.object({
                url: z.string().min(1).describe('URL to open (include https:// or a hostname).'),
                waitUntil: z.enum(['domcontentloaded', 'load', 'networkidle']).optional().describe('How long to wait for navigation to settle.')
            })),
            execute: async ({ url, waitUntil }) => {
                const snapshot = await executeMcpCommand({
                    sessionId,
                    command: {
                        action: 'open',
                        url,
                        alias: 'open',
                        waitUntil: waitUntil ?? 'domcontentloaded'
                    }
                });
                latestSnapshot = snapshot;
                const result = summarizeSnapshotForAgent(snapshot);
                recordToolEvent({ tool: 'open', args: { url, waitUntil }, result });
                return result;
            }
        }),
        click: tool({
            description: 'Click an element. Prefer selectors like @e123 from interactiveRefs.',
            inputSchema: zodSchema(z.object({
                selector: z.string().min(1).describe('Element selector (prefer @e123 refs).'),
                newTab: z.boolean().optional().describe('Open target in a new tab if supported.')
            })),
            execute: async ({ selector, newTab }) => {
                const snapshot = await executeMcpCommand({
                    sessionId,
                    command: {
                        action: 'click',
                        selector,
                        ...(newTab ? { newTab: true } : {}),
                        waitFor: {
                            type: 'domcontentloaded',
                            timeoutMs: 1500
                        }
                    }
                });
                latestSnapshot = snapshot;
                const result = summarizeSnapshotForAgent(snapshot);
                recordToolEvent({ tool: 'click', args: { selector, newTab }, result });
                return result;
            }
        }),
        dblclick: tool({
            description: 'Double-click an element.',
            inputSchema: zodSchema(z.object({
                selector: z.string().min(1).describe('Element selector (prefer @e123 refs).')
            })),
            execute: async ({ selector }) => {
                const snapshot = await executeMcpCommand({
                    sessionId,
                    command: {
                        action: 'dblclick',
                        selector,
                        waitFor: {
                            type: 'domcontentloaded',
                            timeoutMs: 1500
                        }
                    }
                });
                latestSnapshot = snapshot;
                const result = summarizeSnapshotForAgent(snapshot);
                recordToolEvent({ tool: 'dblclick', args: { selector }, result });
                return result;
            }
        }),
        focus: tool({
            description: 'Focus an element (useful before typing).',
            inputSchema: zodSchema(z.object({
                selector: z.string().min(1).describe('Element selector (prefer @e123 refs).')
            })),
            execute: async ({ selector }) => {
                const snapshot = await executeMcpCommand({
                    sessionId,
                    command: {
                        action: 'focus',
                        selector,
                        waitFor: {
                            type: 'none'
                        }
                    }
                });
                latestSnapshot = snapshot;
                const result = summarizeSnapshotForAgent(snapshot);
                recordToolEvent({ tool: 'focus', args: { selector }, result });
                return result;
            }
        }),
        type: tool({
            description: 'Type text into an element (does not reveal the actual text back to you).',
            inputSchema: zodSchema(z.object({
                selector: z.string().min(1).describe('Element selector (prefer @e123 refs).'),
                text: z.string().describe('Text to type.'),
                clear: z.boolean().optional().describe('Whether to clear the field first.'),
                delay: z.number().optional().describe('Optional delay (ms) between keystrokes.')
            })),
            execute: async ({ selector, text, clear, delay }) => {
                const snapshot = await executeMcpCommand({
                    sessionId,
                    command: {
                        action: 'type',
                        selector,
                        text,
                        ...(clear ? { clear: true } : {}),
                        ...(typeof delay === 'number' && Number.isFinite(delay) ? { delay } : {}),
                        waitFor: {
                            type: 'none'
                        }
                    }
                });
                latestSnapshot = snapshot;
                const result = summarizeSnapshotForAgent(snapshot);
                recordToolEvent({
                    tool: 'type',
                    args: { selector, textLength: text.length, clear: Boolean(clear), ...(typeof delay === 'number' ? { delay } : {}) },
                    result
                });
                return result;
            }
        }),
        fill: tool({
            description: 'Fill a form control with a value (does not reveal the actual value back to you).',
            inputSchema: zodSchema(z.object({
                selector: z.string().min(1).describe('Element selector (prefer @e123 refs).'),
                value: z.string().describe('Value to set.')
            })),
            execute: async ({ selector, value }) => {
                const snapshot = await executeMcpCommand({
                    sessionId,
                    command: {
                        action: 'fill',
                        selector,
                        value,
                        waitFor: {
                            type: 'none'
                        }
                    }
                });
                latestSnapshot = snapshot;
                const result = summarizeSnapshotForAgent(snapshot);
                recordToolEvent({
                    tool: 'fill',
                    args: { selector, valueLength: value.length },
                    result
                });
                return result;
            }
        }),
        press: tool({
            description: 'Press a keyboard key (e.g. Enter, Escape). Optionally scoped to a selector.',
            inputSchema: zodSchema(z.object({
                key: z.string().min(1).describe('Key name, e.g. Enter, Escape, ArrowDown.'),
                selector: z.string().optional().describe('Optional selector to target.')
            })),
            execute: async ({ key, selector }) => {
                const trimmedSelector = typeof selector === 'string' ? selector.trim() : '';
                const snapshot = await executeMcpCommand({
                    sessionId,
                    command: {
                        action: 'press',
                        key,
                        ...(trimmedSelector ? { selector: trimmedSelector } : {}),
                        waitFor: {
                            type: 'domcontentloaded',
                            timeoutMs: 1500
                        }
                    }
                });
                latestSnapshot = snapshot;
                const result = summarizeSnapshotForAgent(snapshot);
                recordToolEvent({
                    tool: 'press',
                    args: { key, ...(trimmedSelector ? { selector: trimmedSelector } : {}) },
                    result
                });
                return result;
            }
        })
    } as const;

    const system = [
        'You are a helpful agent that controls a headless browser.',
        'You can call tools to navigate and interact with the page (open, click, dblclick, focus, type, fill, press, snapshot).',
        'Prefer selectors like @e123 from interactiveRefs. Those refs come from the latest snapshot.',
        'If a click seems blocked, check overlayHints and click a closeAction selector.',
        'Keep responses concise and action-oriented. If you are missing info, ask one specific question.'
    ].join('\n');

    const messages: ModelMessage[] = [
        ...toModelMessages(request.history),
        { role: 'user', content: formatBrowserStateForPrompt(latestSnapshot) },
        { role: 'user', content: prompt }
    ];

    const result = await generateText({
        model: provider(modelName),
        system,
        messages,
        tools,
        stopWhen: stepCountIs(8)
    });

    return {
        assistantMessage: result.text.trim() || '(No response text returned.)',
        toolEvents,
        snapshot: latestSnapshot
    };
}
