export type WaitUntilState = 'load' | 'domcontentloaded' | 'networkidle';

export type WaitForCommand =
    | {
        type: 'none';
    }
    | {
        type: 'domcontentloaded' | 'load' | 'networkidle';
        timeoutMs?: number;
    }
    | {
        type: 'url';
        value: string;
        timeoutMs?: number;
    }
    | {
        type: 'selector';
        value: string;
        timeoutMs?: number;
        state?: 'attached' | 'detached' | 'visible' | 'hidden';
    };

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
        waitFor?: WaitForCommand;
    }
    | {
        action: 'dblclick';
        selector: string;
        waitFor?: WaitForCommand;
    }
    | {
        action: 'focus';
        selector: string;
        waitFor?: WaitForCommand;
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
