import { defineConfig, devices } from '@playwright/test'

const localBaseUrl = 'http://127.0.0.1:4173'
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.trim()
const baseURL = externalBaseUrl || localBaseUrl

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results/playwright',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL,
    colorScheme: 'dark',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  webServer: externalBaseUrl
    ? undefined
    : {
      command: 'npm run dev -- --host 127.0.0.1 --port 4173',
      url: localBaseUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  projects: [
    {
      name: 'auth-setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'responsive-public',
      testMatch: /public-responsive\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'responsive',
      testMatch: /(athlete-form|enrollment-sheet|kiosk-credential|store-kiosk-improvements)-responsive\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
