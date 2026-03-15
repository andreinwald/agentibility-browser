import type { AgentChatApi, AgentChatRequest, AgentChatResponse } from '../../shared/agentChat.js';

type JsonObject = Record<string, unknown>;

async function postJson(path: string, payload: JsonObject): Promise<AgentChatResponse> {
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

    return response.json() as Promise<AgentChatResponse>;
}

function createWebAgentChatApi(): AgentChatApi {
    return {
        sendMessage: (request: AgentChatRequest) => postJson('/api/agent-chat/send', request as unknown as JsonObject)
    };
}

export function ensureAgentChatApiBridge(): void {
    if (window.agentChatApi) {
        return;
    }

    window.agentChatApi = createWebAgentChatApi();
}

