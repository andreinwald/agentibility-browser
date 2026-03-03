export type WaitUntilState = 'load' | 'domcontentloaded' | 'networkidle';

export type SnapshotRef = {
    selector: string;
    role: string;
    name?: string;
    nth?: number;
};

export type SnapshotRefs = Record<string, SnapshotRef>;

export type McpCommand =
    | {
        action: 'open';
        url: string;
        waitUntil?: WaitUntilState;
        alias?: 'open' | 'goto' | 'navigate';
    }
    | {
        action: 'click';
        selector: string;
        newTab?: boolean;
    }
    | {
        action: 'dblclick';
        selector: string;
    }
    | {
        action: 'focus';
        selector: string;
    };

export type CommandHistoryEntry = {
    id: string;
    action: McpCommand['action'];
    commandLine: string;
    params: Record<string, string | boolean>;
    status: 'success' | 'error';
    errorMessage?: string;
    executedAt: string;
};

export type OverlayCloseAction = {
    label: string;
    selector: string;
    confidence: 'high' | 'medium' | 'low';
};

export type OverlayHint = {
    id: string;
    kind: 'dialog' | 'cookie-banner' | 'overlay';
    reason: string;
    confidence: 'high' | 'medium' | 'low';
    closeActions: OverlayCloseAction[];
    htmlSnippet?: string;
};

export type SnapshotResponse = {
    sessionId?: string;
    rawUrl: string;
    targetUrl?: string;
    statusMessage: string;
    errorMessage: string;
    htmlPieces: string[];
    refs: SnapshotRefs;
    commandHistory: CommandHistoryEntry[];
    overlayHints: OverlayHint[];
};

export type LoadSnapshotRequest = {
    rawUrl: string;
    sessionId?: string;
};

export type ExecuteMcpRequest = {
    sessionId: string;
    command: McpCommand;
};

export type SnapshotApi = {
    loadSnapshot: (url: string, sessionId?: string) => Promise<SnapshotResponse>;
    refreshSnapshot: (sessionId: string) => Promise<SnapshotResponse>;
    closeSession: (sessionId: string) => Promise<void>;
    executeMcpCommand: (request: ExecuteMcpRequest) => Promise<SnapshotResponse>;
};
