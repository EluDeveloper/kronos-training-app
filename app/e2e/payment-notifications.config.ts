import { defineConfig } from '@playwright/test'

// Separate local-only QA config: no existing auth state and no production fallback.
export default defineConfig({
  testDir: './responsive',
  testMatch: /payment-notifications-responsive\.spec\.ts/,
  outputDir: '../test-results/payment-notifications',
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173', screenshot: 'only-on-failure', trace: 'off' },
  projects: [{ name: 'responsive', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run dev:emulator -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173', reuseExistingServer: true,
  },
})
