import { BrowserManager } from 'agent-browser/dist/browser.js';

const browser = new BrowserManager();

import express from 'express';
import { ariaToHtml } from './src/AriaToHtml/AriaToHtml';

const app = express();
const SHADCN_TAILWIND_CONFIG = `
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        border: 'hsl(var(--border))',
                        input: 'hsl(var(--input))',
                        ring: 'hsl(var(--ring))',
                        background: 'hsl(var(--background))',
                        foreground: 'hsl(var(--foreground))',
                        primary: {
                            DEFAULT: 'hsl(var(--primary))',
                            foreground: 'hsl(var(--primary-foreground))'
                        },
                        secondary: {
                            DEFAULT: 'hsl(var(--secondary))',
                            foreground: 'hsl(var(--secondary-foreground))'
                        },
                        muted: {
                            DEFAULT: 'hsl(var(--muted))',
                            foreground: 'hsl(var(--muted-foreground))'
                        },
                        accent: {
                            DEFAULT: 'hsl(var(--accent))',
                            foreground: 'hsl(var(--accent-foreground))'
                        },
                        card: {
                            DEFAULT: 'hsl(var(--card))',
                            foreground: 'hsl(var(--card-foreground))'
                        },
                        destructive: {
                            DEFAULT: 'hsl(var(--destructive))',
                            foreground: 'hsl(var(--destructive-foreground))'
                        }
                    },
                    borderRadius: {
                        lg: 'var(--radius)',
                        md: 'calc(var(--radius) - 2px)',
                        sm: 'calc(var(--radius) - 4px)'
                    }
                }
            }
        }
    </script>
`;

const SHADCN_THEME_CSS = `
    :root {
        --background: 0 0% 100%;
        --foreground: 222.2 84% 4.9%;
        --card: 0 0% 100%;
        --card-foreground: 222.2 84% 4.9%;
        --primary: 222.2 47.4% 11.2%;
        --primary-foreground: 210 40% 98%;
        --secondary: 210 40% 96.1%;
        --secondary-foreground: 222.2 47.4% 11.2%;
        --muted: 210 40% 96.1%;
        --muted-foreground: 215.4 16.3% 46.9%;
        --accent: 210 40% 96.1%;
        --accent-foreground: 222.2 47.4% 11.2%;
        --destructive: 0 84.2% 60.2%;
        --destructive-foreground: 210 40% 98%;
        --border: 214.3 31.8% 91.4%;
        --input: 214.3 31.8% 91.4%;
        --ring: 222.2 84% 4.9%;
        --radius: 0.5rem;
    }
    * { box-sizing: border-box; }
    body {
        margin: 0;
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .ax-node[data-role="document"] {
        padding-bottom: 2rem;
    }
    .ax-grid > .ax-item {
        border: 1px solid hsl(var(--border));
        border-radius: var(--radius);
        background: hsl(var(--card));
        min-height: 3.5rem;
        padding: 0.75rem;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
    }
    .ax-main > .ax-paragraph,
    .ax-main > .ax-text {
        max-width: 72ch;
    }
    .ax-nav-directory > .ax-heading-h2 {
        margin-top: 1.25rem;
    }
    .ax-nav-directory > .ax-heading-h2:first-child {
        margin-top: 0;
    }
    @media (max-width: 640px) {
        .ax-header {
            justify-content: flex-start;
        }
    }
`;

const PREVIEW_CSS = `
    body {
        line-height: 1.45;
    }
    .ax-main > .ax-node {
        margin-bottom: 0.35rem;
    }
    .ax-nav-main > .ax-list {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.5rem;
    }
`;

function normalizeRequestedUrl(raw: string): string | undefined {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;

    let candidate = trimmed;
    if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(candidate)) {
        candidate = `https://${candidate}`;
    }

    try {
        const parsed = new URL(candidate);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
        return parsed.toString();
    } catch {
        return undefined;
    }
}

function escapeHtml(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeAttr(input: string): string {
    return escapeHtml(input).replace(/"/g, '&quot;');
}

app.get('/', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
    const targetUrl = normalizeRequestedUrl(rawUrl);

    let htmlPieces: string[] = [];
    let statusMessage = 'Enter a URL and press Go.';
    let errorMessage = '';
    let launched = false;

    if (rawUrl && !targetUrl) {
        errorMessage = 'Invalid URL. Use http:// or https:// (or enter a hostname).';
    }

    if (targetUrl) {
        try {
            await browser.launch({ action: 'launch', id: 'default', headless: true });
            launched = true;
            await browser.getPage().goto(targetUrl, { waitUntil: 'networkidle' });
            const snapshot = await browser.getSnapshot({});
            htmlPieces = ariaToHtml(snapshot.tree);
            statusMessage = `Viewing ${targetUrl}`;
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : String(error);
            statusMessage = `Failed to load ${targetUrl}`;
        } finally {
            if (launched) {
                await browser.close();
            }
        }
    }

    const formValue = escapeAttr(rawUrl || '');
    const status = escapeHtml(statusMessage);
    const error = escapeHtml(errorMessage);
    const content = htmlPieces.length > 0
        ? htmlPieces.join('\n')
        : '<div class="mx-auto mt-8 w-full max-w-6xl rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">No snapshot yet.</div>';

    res.send(`<!DOCTYPE html><html><head><title>Snapshot Browser</title>${SHADCN_TAILWIND_CONFIG}<script src="https://cdn.tailwindcss.com"></script><style>${SHADCN_THEME_CSS}${PREVIEW_CSS}</style></head><body class="bg-background text-foreground antialiased"><header class="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur"><form method="GET" action="/" class="mx-auto flex w-full max-w-6xl items-center gap-2 p-3"><div class="text-xs font-medium text-muted-foreground">mini-browser</div><input name="url" type="text" placeholder="https://example.com" value="${formValue}" class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm" /><button type="submit" class="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground">Go</button></form><div class="mx-auto w-full max-w-6xl px-3 pb-2 text-xs text-muted-foreground">${status}</div>${errorMessage ? `<div class="mx-auto mb-2 w-full max-w-6xl rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive">${error}</div>` : ''}</header>${content}</body></html>`);
});

const PORT = 3003;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
