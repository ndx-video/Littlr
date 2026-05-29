# E2E tests (Playwright + Vite)

Browser-mode tests run the **renderer against the Vite dev server** with a stubbed
Tauri bridge. They do not launch the Tauri binary or Node sidecar.

## Ports (local dev)

| Port | Service | Notes |
|------|---------|--------|
| **5173** | Vite (`yarn dev:web`) | Fixed in `vite.config.ts` (`strictPort: true`). Playwright `webServer` uses this. |
| **5174** | Vite HMR (optional) | Used when `TAURI_DEV_HOST` is set for remote Tauri dev. |
| **127.0.0.1:0** | Sync HTTP / Native RPC | Ephemeral ports chosen at runtime by the Tauri shell (not fixed). |

If port 5173 is stuck after a crashed dev session:

```powershell
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
```

## Commands

First-time setup (Chromium browser binary):

```bash
corepack yarn playwright:install
```

```bash
corepack yarn test:e2e          # headless Chromium
corepack yarn test:e2e:ui       # interactive UI mode
corepack yarn test:e2e:report   # open HTML report after a run
```

## How it works

1. Playwright starts `yarn dev:web --host 127.0.0.1` (or reuses an existing server).
2. Tests intercept `tauri-shim.ts` and load `e2e/stubs/tauri-shim.stub.js` instead.
3. The stub provides minimal `window.ipc` / `window.config` so Vue can boot.

For full-stack tests (sidecar + Tauri shell), use `yarn sidecar:smoke` and manual UAT,
or add a future Windows CDP project against a running `littlr.exe`.
