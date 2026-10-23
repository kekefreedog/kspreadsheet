const { defineConfig } = require('@playwright/test');
const browserName = process.env.PLAYWRIGHT_BROWSER || 'chromium';

module.exports = defineConfig({
    testDir: './tests-browser',
    fullyParallel: true,
    use: {
        browserName,
        channel: browserName === 'chromium' ? process.env.PLAYWRIGHT_CHANNEL || undefined : undefined,
        headless: true,
        viewport: { width: 1400, height: 900 },
        launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] },
    },
});
