import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Connect, type Plugin } from 'vite';
import type { ExecuteMcpRequest, LoadSnapshotRequest, McpCommand } from './src/electron/shared/snapshot.js';
import {
    closeAllSnapshotSessions,
    closeSnapshotSession,
    executeMcpCommand,
    loadSnapshot,
    refreshSnapshot
} from './src/electron/main/services/SnapshotService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseLoadRequest(payload: unknown): LoadSnapshotRequest {
    if (!payload || typeof payload !== 'object') {
        return { rawUrl: '' };
    }

    const rawPayload = payload as { rawUrl?: unknown; sessionId?: unknown };
    return {
        rawUrl: typeof rawPayload.rawUrl === 'string' ? rawPayload.rawUrl : '',
        sessionId: typeof rawPayload.sessionId === 'string' ? rawPayload.sessionId : undefined
    };
}

function parseSessionId(payload: unknown): string {
    if (!payload || typeof payload !== 'object') {
        return '';
    }

    const rawPayload = payload as { sessionId?: unknown };
    return typeof rawPayload.sessionId === 'string' ? rawPayload.sessionId : '';
}

function parseMcpCommand(payload: unknown): McpCommand {
    if (!payload || typeof payload !== 'object') {
        return { action: 'click', selector: '' };
    }

    const rawPayload = payload as Record<string, unknown>;
    const action = typeof rawPayload.action === 'string' ? rawPayload.action : '';
    if (action === 'open') {
        return {
            action: 'open',
            url: typeof rawPayload.url === 'string' ? rawPayload.url : '',
            waitUntil: rawPayload.waitUntil === 'load' || rawPayload.waitUntil === 'domcontentloaded' || rawPayload.waitUntil === 'networkidle'
                ? rawPayload.waitUntil
                : undefined,
            alias: rawPayload.alias === 'open' || rawPayload.alias === 'goto' || rawPayload.alias === 'navigate'
                ? rawPayload.alias
                : undefined
        };
    }

    if (action === 'dblclick') {
        return {
            action: 'dblclick',
            selector: typeof rawPayload.selector === 'string' ? rawPayload.selector : ''
        };
    }

    if (action === 'focus') {
        return {
            action: 'focus',
            selector: typeof rawPayload.selector === 'string' ? rawPayload.selector : ''
        };
    }

    return {
        action: 'click',
        selector: typeof rawPayload.selector === 'string' ? rawPayload.selector : '',
        newTab: Boolean(rawPayload.newTab)
    };
}

function parseExecuteMcpRequest(payload: unknown): ExecuteMcpRequest {
    if (!payload || typeof payload !== 'object') {
        return {
            sessionId: '',
            command: { action: 'click', selector: '' }
        };
    }

    const rawPayload = payload as { sessionId?: unknown; command?: unknown };
    return {
        sessionId: typeof rawPayload.sessionId === 'string' ? rawPayload.sessionId : '',
        command: parseMcpCommand(rawPayload.command)
    };
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) {
        return {};
    }

    try {
        return JSON.parse(raw);
    } catch {
        throw new Error('Invalid JSON payload.');
    }
}

function respondJson(response: ServerResponse, status: number, payload: unknown): void {
    response.statusCode = status;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(JSON.stringify(payload));
}

function snapshotApiPlugin(): Plugin {
    let didCleanup = false;

    const closeSessions = async (): Promise<void> => {
        if (didCleanup) return;
        didCleanup = true;
        await closeAllSnapshotSessions();
    };

    const middleware: Connect.NextHandleFunction = (request, response, next) => {
        void (async () => {
            const method = request.method || 'GET';
            const requestUrl = request.url || '/';
            const pathname = new URL(requestUrl, 'http://127.0.0.1').pathname;

            if (!pathname.startsWith('/api/snapshot/')) {
                next();
                return;
            }

            try {
                if (method === 'POST' && pathname === '/api/snapshot/load') {
                    const payload = await readJsonBody(request);
                    const data = await loadSnapshot(parseLoadRequest(payload));
                    respondJson(response, 200, data);
                    return;
                }

                if (method === 'POST' && pathname === '/api/snapshot/refresh') {
                    const payload = await readJsonBody(request);
                    const data = await refreshSnapshot(parseSessionId(payload));
                    respondJson(response, 200, data);
                    return;
                }

                if (method === 'POST' && pathname === '/api/snapshot/close-session') {
                    const payload = await readJsonBody(request);
                    await closeSnapshotSession(parseSessionId(payload));
                    respondJson(response, 200, { ok: true });
                    return;
                }

                if (method === 'POST' && pathname === '/api/snapshot/execute-mcp') {
                    const payload = await readJsonBody(request);
                    const data = await executeMcpCommand(parseExecuteMcpRequest(payload));
                    respondJson(response, 200, data);
                    return;
                }

                respondJson(response, 404, { error: 'Not found' });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                respondJson(response, 500, { error: message });
            }
        })();
    };

    return {
        name: 'snapshot-api-middleware',
        configureServer(server): void {
            server.middlewares.use(middleware);
            server.httpServer?.once('close', () => {
                void closeSessions();
            });
        }
    };
}

export default defineConfig({
    root: path.resolve(__dirname, 'src/electron'),
    server: {
        host: '127.0.0.1',
        port: 4173,
        strictPort: true
    },
    plugins: [snapshotApiPlugin()]
});
