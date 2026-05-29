import { test, expect, VITE_DEV_PORT } from './fixtures'

test.describe('Main window (browser harness)', () => {
  test('loads main.html and mounts the Vue app shell', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message)
    })

    await page.goto(
      `http://127.0.0.1:${VITE_DEV_PORT}/static/pages/main.html?window_id=e2e-main`
    )

    // #app exists before Vue mounts; wait for editor chrome instead of empty shell visibility.
    await expect(page.locator('#app #window-frame, #app .main-editor-wrapper, #app .file-manager').first()).toBeVisible({ timeout: 45_000 })

    const fatal = consoleErrors.filter(
      (line) =>
        !line.includes('favicon') &&
        !line.includes('DevTools') &&
        !line.includes('ERR_UNKNOWN_URL_SCHEME') &&
        !line.includes('Lit is in dev mode')
    )
    expect(fatal, `renderer errors: ${fatal.join('\n')}`).toEqual([])
  })
})
