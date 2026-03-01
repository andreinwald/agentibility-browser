import { BrowserManager } from 'agent-browser/dist/browser.js';

const browser = new BrowserManager();

import express from 'express';
import { ariaToHtml } from './src/AriaToHtml/AriaToHtml';
import { URL } from './src/Constants.js';

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

app.get('/', async (req, res) => {
    await browser.launch({ action: 'launch', id: 'default', headless: true });
    await browser.getPage().goto(URL);
    const snapshot = await browser.getSnapshot({});
    console.log('---------------------------------------')
    console.log(snapshot.tree)
    const htmlPieces = ariaToHtml(snapshot.tree);
    res.send(`<!DOCTYPE html><html><head><title>Snapshot</title>${SHADCN_TAILWIND_CONFIG}<script src="https://cdn.tailwindcss.com"></script><style>${SHADCN_THEME_CSS}${PREVIEW_CSS}</style></head><body class="bg-background text-foreground antialiased">${htmlPieces.join('\n')}</body></html>`);
    await browser.close();
});

const PORT = 3003;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
