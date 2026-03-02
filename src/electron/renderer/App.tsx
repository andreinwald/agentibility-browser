import { BrowserChrome } from './components/BrowserChrome.js';
import { SnapshotContent } from './components/SnapshotContent.js';
import { useSnapshotTabs } from './hooks/useSnapshotTabs.js';

declare const React: typeof import('react');

export function App(): React.ReactElement {
    const {
        tabs,
        activeTab,
        activeEntry,
        isLoading,
        activateTab,
        createTab,
        closeTab,
        submitActiveTab,
        updateActiveInput,
        goBack,
        goForward,
        reloadCurrent
    } = useSnapshotTabs();

    return (
        <>
            <BrowserChrome
                tabs={tabs}
                activeTab={activeTab}
                isLoading={isLoading}
                onActivateTab={activateTab}
                onCreateTab={() => {
                    createTab();
                }}
                onCloseTab={closeTab}
                onSubmit={submitActiveTab}
                onInputChange={updateActiveInput}
                onBack={goBack}
                onForward={goForward}
                onReload={reloadCurrent}
            />

            <main className="mx-auto w-full max-w-6xl px-3 py-4" id="content">
                <SnapshotContent htmlPieces={activeEntry?.htmlPieces} />
            </main>
        </>
    );
}
