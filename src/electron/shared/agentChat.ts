import type { SnapshotResponse } from './snapshot.js';

export type AgentChatHistoryMessage = {
    role: 'user' | 'assistant';
    content: string;
};

export type AgentChatRequest = {
    sessionId: string;
    prompt: string;
    history?: AgentChatHistoryMessage[];
    apiBaseUrl?: string;
    apiKey?: string;
    model?: string;
};

export type AgentChatToolEvent = {
    tool: string;
    args: Record<string, unknown>;
    result?: unknown;
    error?: string;
};

export type AgentChatResponse = {
    assistantMessage: string;
    toolEvents: AgentChatToolEvent[];
    snapshot: SnapshotResponse;
};

export type AgentChatApi = {
    sendMessage: (request: AgentChatRequest) => Promise<AgentChatResponse>;
};
