declare const React: typeof import('react');

type SnapshotContentProps = {
    htmlPieces?: string[];
};

export function SnapshotContent({ htmlPieces }: SnapshotContentProps): React.ReactElement {
    if (!Array.isArray(htmlPieces) || htmlPieces.length === 0) {
        return (
            <div className="w-full rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
                No snapshot yet.
            </div>
        );
    }

    return <div dangerouslySetInnerHTML={{ __html: htmlPieces.join('\n') }} />;
}
