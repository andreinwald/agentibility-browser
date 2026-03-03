import { App } from './App.js';
import { ensureSnapshotApiBridge } from './lib/browserSnapshotApi.js';

declare const React: typeof import('react');
declare const ReactDOM: typeof import('react-dom/client');

ensureSnapshotApiBridge();

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Missing #root element in index.html');
}

ReactDOM.createRoot(rootElement).render(<App />);
