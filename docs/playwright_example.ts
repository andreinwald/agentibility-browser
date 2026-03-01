import { chromium } from 'playwright';

(async () => {
    // Launch headless Chrome
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://vercel.com/ai-gateway', { waitUntil: 'networkidle' });

    // In Playwright 1.58.2, page.accessibility.snapshot() is removed.
    // We use a CDPSession to get the full accessibility tree from Chrome directly.
    const client = await page.context().newCDPSession(page);
    const accessibilityTree = await client.send('Accessibility.getFullAXTree');

    console.log('--- Full Accessibility Tree (CDP) ---');
    console.log(JSON.stringify(accessibilityTree, null, 2));

    // Get the Aria Snapshot (YAML representation)
    // @ts-ignore - ariaSnapshot is available in Playwright 1.50+
    const ariaSnapshot = await page.locator('body').ariaSnapshot();

    console.log('\n--- Aria Snapshot (YAML) ---');
    console.log(ariaSnapshot);

    // Cleanup

    await browser.close();
})();