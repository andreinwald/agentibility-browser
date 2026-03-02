export type SnapshotResponse = {
    sessionId?: string;
    rawUrl: string;
    targetUrl?: string;
    statusMessage: string;
    errorMessage: string;
    htmlPieces: string[];
};

export type LoadSnapshotRequest = {
    rawUrl: string;
    sessionId?: string;
};

export type SnapshotApi = {
    loadSnapshot: (url: string, sessionId?: string) => Promise<SnapshotResponse>;
    refreshSnapshot: (sessionId: string) => Promise<SnapshotResponse>;
    closeSession: (sessionId: string) => Promise<void>;
};
