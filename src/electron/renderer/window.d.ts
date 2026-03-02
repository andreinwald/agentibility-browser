import type { SnapshotApi } from '../shared/snapshot.js';

declare global {
    interface Window {
        snapshotApi?: SnapshotApi;
    }
}

export {};
