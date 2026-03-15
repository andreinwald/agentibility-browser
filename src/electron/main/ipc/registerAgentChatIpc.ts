import { ipcMain } from 'electron';
import type { AgentChatHistoryMessage, AgentChatRequest } from '../../shared/agentChat.js';
import { runAgentChat } from '../services/AgentChatService.js';

function parseHistory(payload: unknown): AgentChatHistoryMessage[] | undefined {
    if (!Array.isArray(payload)) return undefined;

    const history: AgentChatHistoryMessage[] = [];
    for (const entry of payload) {
        if (!entry || typeof entry !== 'object') continue;
        const raw = entry as Record<string, unknown>;
        const role = raw.role === 'user' || raw.role === 'assistant' ? raw.role : null;
        const content = typeof raw.content === 'string' ? raw.content : '';
        if (!role || !content.trim()) continue;
        history.push({ role, content });
        if (history.length >= 64) break;
    }
    return history;
}

function parseAgentChatRequest(payload: unknown): AgentChatRequest {
    if (!payload || typeof payload !== 'object') {
        return {
            sessionId: '',
            prompt: ''
        };
    }

    const raw = payload as Record<string, unknown>;
    return {
        sessionId: typeof raw.sessionId === 'string' ? raw.sessionId : '',
        prompt: typeof raw.prompt === 'string' ? raw.prompt : '',
        history: parseHistory(raw.history),
        apiBaseUrl: typeof raw.apiBaseUrl === 'string' ? raw.apiBaseUrl : undefined,
        apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : undefined,
        model: typeof raw.model === 'string' ? raw.model : undefined
    };
}

export function registerAgentChatIpcHandlers(): void {
    ipcMain.handle('agent-chat:send', async (_event, payload: unknown) => {
        return runAgentChat(parseAgentChatRequest(payload));
    });
}

