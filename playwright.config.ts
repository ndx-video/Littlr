import { defineConfig, devices } from '@playwright/test'

/** Must match vite.config.ts server.port */
const VITE_DEV_PORT = 5173

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 30_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${VITE_DEV_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: 'corepack yarn dev:web --host 127.0.0.1',
    url: `http://127.0.0.1:${VITE_DEV_PORT}/static/pages/main.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
})
