import type { McpCommand } from '../../shared/snapshot.js';

declare const React: typeof import('react');

type SnapshotContentProps = {
    htmlPieces?: string[];
    onMcpAction?: (command: McpCommand) => void | Promise<void>;
};

function toRefSelector(ref: string): string {
    const trimmed = ref.trim();
    if (!trimmed) return '';
    return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

function findInteractiveTarget(start: EventTarget | null): HTMLElement | null {
    if (!(start instanceof HTMLElement)) return null;

    const interactive = start.closest('a[data-ref], button[data-ref]');
    if (!(interactive instanceof HTMLElement)) return null;

    return interactive;
}

export function SnapshotContent({ htmlPieces, onMcpAction }: SnapshotContentProps): React.ReactElement {
    const handleClick = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        if (!onMcpAction) return;

        const interactive = findInteractiveTarget(event.target);
        if (!interactive) return;

        const ref = interactive.getAttribute('data-ref');
        if (!ref) return;

        event.preventDefault();
        event.stopPropagation();

        const selector = toRefSelector(ref);
        if (!selector) return;

        const newTab = event.metaKey || event.ctrlKey;
        void onMcpAction({
            action: 'click',
            selector,
            ...(newTab ? { newTab: true } : {})
        });
    }, [onMcpAction]);

    const handleDoubleClick = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        if (!onMcpAction) return;

        const interactive = findInteractiveTarget(event.target);
        if (!interactive) return;

        const ref = interactive.getAttribute('data-ref');
        if (!ref) return;

        event.preventDefault();
        event.stopPropagation();

        const selector = toRefSelector(ref);
        if (!selector) return;

        void onMcpAction({
            action: 'dblclick',
            selector
        });
    }, [onMcpAction]);

    if (!Array.isArray(htmlPieces) || htmlPieces.length === 0) {
        return (
            <div className="w-full rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
                No snapshot yet.
            </div>
        );
    }

    return (
        <div
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            dangerouslySetInnerHTML={{ __html: htmlPieces.join('\n') }}
        />
    );
}
