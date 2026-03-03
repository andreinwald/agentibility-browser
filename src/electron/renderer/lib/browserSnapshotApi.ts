import type { ExecuteMcpRequest, SnapshotApi, SnapshotResponse } from '../../shared/snapshot.js';

type JsonObject = Record<string, unknown>;

async function postJson(path: string, payload: JsonObject): Promise<SnapshotResponse> {
    const response = await fetch(path, {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `HTTP ${response.status}`);
    }

    return response.json() as Promise<SnapshotResponse>;
}

function createWebSnapshotApi(): SnapshotApi {
    return {
        loadSnapshot: (url: string, sessionId?: string) => postJson('/api/snapshot/load', { rawUrl: url, sessionId }),
        refreshSnapshot: (sessionId: string) => postJson('/api/snapshot/refresh', { sessionId }),
        closeSession: async (sessionId: string): Promise<void> => {
            await fetch('/api/snapshot/close-session', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json'
                },
                body: JSON.stringify({ sessionId })
            });
        },
        executeMcpCommand: (request: ExecuteMcpRequest) => postJson('/api/snapshot/execute-mcp', request as JsonObject)
    };
}

export function ensureSnapshotApiBridge(): void {
    if (window.snapshotApi) {
        return;
    }

    window.snapshotApi = createWebSnapshotApi();
}
