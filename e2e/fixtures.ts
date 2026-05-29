import { test as base, type Page } from '@playwright/test'
import path from 'node:path'

const stubPath = path.join(__dirname, 'stubs', 'tauri-shim.stub.js')

/** Vite dev server (see vite.config.ts). Playwright webServer uses the same port. */
export const VITE_DEV_PORT = 5173

export async function installTauriMocks (page: Page): Promise<void> {
  await page.route('**/port/sidecar/adapters/tauri-shim.ts', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      path: stubPath
    })
  })
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await installTauriMocks(page)
    await use(page)
  }
})

export { expect } from '@playwright/test'
