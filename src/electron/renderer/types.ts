import type { CommandHistoryEntry, SnapshotResponse } from '../shared/snapshot.js';

export type Tab = {
    id: number;
    title: string;
    inputValue: string;
    statusMessage: string;
    errorMessage: string;
    history: SnapshotResponse[];
    historyIndex: number;
    loading: boolean;
    refreshing: boolean;
    requestToken: number;
    sessionId?: string;
    commandHistory: CommandHistoryEntry[];
};

export type LoadMode = 'navigate' | 'refresh';
