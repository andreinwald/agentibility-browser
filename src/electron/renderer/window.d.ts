import type { AgentChatApi } from '../shared/agentChat.js';
import type { SnapshotApi } from '../shared/snapshot.js';

declare global {
    interface Window {
        snapshotApi?: SnapshotApi;
        agentChatApi?: AgentChatApi;
    }
}

export {};
