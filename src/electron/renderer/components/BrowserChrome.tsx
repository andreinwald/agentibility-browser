import type { Tab } from '../types.js';

declare const React: typeof import('react');

type BrowserChromeProps = {
    tabs: Tab[];
    activeTab: Tab | null;
    isLoading: boolean;
    onActivateTab: (tabId: number) => void;
    onCreateTab: () => void;
    onCloseTab: (tabId: number) => void;
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
    onInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onBack: () => void;
    onForward: () => void;
    onReload: () => void;
};

export function BrowserChrome(props: BrowserChromeProps): React.ReactElement {
    const {
        tabs,
        activeTab,
        isLoading,
        onActivateTab,
        onCreateTab,
        onCloseTab,
        onSubmit,
        onInputChange,
        onBack,
        onForward,
        onReload
    } = props;

    return (
        <header className="chrome-header">
            <div className="chrome-tabbar">
                <div className="chrome-tabs" id="tabs">
                    {tabs.map((tab) => {
                        const isActiveTab = tab.id === activeTab?.id;
                        const rootClass = isActiveTab ? 'chrome-tab is-active' : 'chrome-tab';

                        return (
                            <div className={rootClass} key={tab.id}>
                                <button
                                    type="button"
                                    className="chrome-tab-title"
                                    onClick={() => {
                                        onActivateTab(tab.id);
                                    }}
                                >
                                    {tab.title}
                                </button>
                                <button
                                    type="button"
                                    className="chrome-tab-close"
                                    aria-label="Close tab"
                                    onClick={() => {
                                        onCloseTab(tab.id);
                                    }}
                                >
                                    ×
                                </button>
                            </div>
                        );
                    })}

                    <button
                        type="button"
                        className="chrome-new-tab"
                        aria-label="New tab"
                        onClick={onCreateTab}
                    >
                        +
                    </button>
                </div>
            </div>

            <form className="chrome-toolbar" id="url-form" onSubmit={onSubmit}>
                <button
                    id="back-button"
                    type="button"
                    className="chrome-nav-btn"
                    aria-label="Back"
                    title="Back"
                    disabled={!activeTab || isLoading || activeTab.historyIndex <= 0}
                    onClick={onBack}
                >
                    ←
                </button>
                <button
                    id="forward-button"
                    type="button"
                    className="chrome-nav-btn"
                    aria-label="Forward"
                    title="Forward"
                    disabled={!activeTab || isLoading || activeTab.historyIndex < 0 || activeTab.historyIndex >= activeTab.history.length - 1}
                    onClick={onForward}
                >
                    →
                </button>
                <button
                    id="reload-button"
                    type="button"
                    className="chrome-nav-btn"
                    aria-label={isLoading ? 'Loading' : 'Reload'}
                    title={isLoading ? 'Loading' : 'Reload'}
                    disabled={!activeTab || isLoading}
                    onClick={onReload}
                >
                    {isLoading ? <span className="chrome-spinner" aria-hidden="true" /> : '↻'}
                </button>
                <label className="chrome-omnibox" htmlFor="url-input">
                    <input
                        id="url-input"
                        name="url"
                        type="text"
                        placeholder="Type website URL here"
                        className="chrome-omnibox-input"
                        value={activeTab?.inputValue || ''}
                        onChange={onInputChange}
                    />
                </label>
            </form>

            {activeTab?.errorMessage ? (
                <div className="chrome-error" id="error">
                    {activeTab.errorMessage}
                </div>
            ) : (
                <div hidden className="chrome-error" id="error" />
            )}
        </header>
    );
}
