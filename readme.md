# Agent-first Browser (Electron)
Desktop app that renders web pages as an agent-first accessibility snapshot.

<img src="./app_screenshot.png" alt="app screenshot" style="height: 500px" />

## Local setup (macOS)

```bash
npm install
```

Install Playwright Chromium once (required for page capture):

```bash
npx playwright install chromium
```

## Run the app

```bash
npm start
```

This opens the Electron app window. Enter a URL and press `Go` to load the snapshot view.

## Useful scripts

```bash
npm run build      # compile TypeScript to ./dist
npm run typecheck  # TypeScript checks without emitting files
npm run dev        # alias for npm start
```
