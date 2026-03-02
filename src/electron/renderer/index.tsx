import { App } from './App.js';

declare const React: typeof import('react');
declare const ReactDOM: typeof import('react-dom/client');

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Missing #root element in index.html');
}

ReactDOM.createRoot(rootElement).render(<App />);
