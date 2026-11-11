import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    reporter: 'list',
    projects: [
        {
            name: 'setup',
            testMatch: /.*\.setup\.ts/
        },
        {
            name: 'e2e',
            testIgnore: /.*\.(setup|teardown)\.ts/,
            dependencies: ['setup'],
            teardown: 'cleanup'
        },
        {
            name: 'cleanup',
            testMatch: /.*\.teardown\.ts/,
            use: {
                storageState: 'tests/e2e/.auth/sheets.json'
            }
        }
    ],
    use: {
        baseURL
    },
    webServer: process.env.PLAYWRIGHT_BASE_URL
        ? undefined
        : {
              command: 'npm run dev',
              url: 'http://127.0.0.1:3000/api/health',
              reuseExistingServer: !process.env.CI,
              timeout: 120000
          }
});
