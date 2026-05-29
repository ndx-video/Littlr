# AGENTS.md

This repository is **Littlr** — a fork of [Zettlr](https://github.com/Zettlr/Zettlr) created to execute the Electron → Tauri migration described in [`port/to-tauri.md`](port/to-tauri.md).

Upstream Zettlr remains Electron-based. **This fork’s primary goal is the migration**, not general upstream feature work.

## What we are building

| Layer | Location | Role |
|-------|----------|------|
| Tauri shell (Rust) | `src-tauri/` | Windows, menus, native OS APIs, sidecar lifecycle, native RPC |
| Node sidecar | `port/sidecar/` | Full `AppServiceContainer` + existing provider logic |
| Frontend (Vue) | `source/` | Existing Zettlr UI — 14 Vite MPA entries under `static/pages/` |
| Migration docs | `port/` | Plans, spikes, schemas |

**Strategy (Phase A):** Tauri 2 + system WebView + Node sidecar. Providers move to Rust one-by-one (Phase B) until the sidecar can be removed.

See [`port/README.md`](port/README.md) for phase status and [`port/to-tauri.md`](port/to-tauri.md) for the full plan.

## Current phase: 3 (Tauri-only release path)

The Electron toolchain has been removed. **`corepack yarn tauri:build`** is the release path.

Completed:

- Tauri 2 shell with plugins (dialog, opener, clipboard, os, shell, single-instance)
- Node sidecar boots full `AppServiceContainer` (stdio JSON-RPC)
- `window.ipc` / `window.config` shim (`port/sidecar/adapters/tauri-shim.ts`)
- Sync HTTP bridge for renderer `sendSync` hot paths (`__LITTLR_SYNC_PORT__` + URL fallback)
- Native RPC bridge (sidecar → Rust) for dialogs, shell, clipboard, windows
- Vite MPA for all 14 renderer windows
- Renderer console → sidecar log bridge (via `tauri-shim` + `log-provider`)
- Simple PDF export removed (Pandoc PDF remains)
- CI: `.github/workflows/tauri-spike.yml`, `.github/workflows/tauri-build.yml`
- Sidecar smoke test: `corepack yarn sidecar:smoke`

Known gaps (Phase 3 / pre-UAT):

- **Auto-update:** Tauri updater plugin not wired yet; `UpdateProvider` still uses custom GitHub logic. Requires signed update endpoint before enabling `tauri-plugin-updater`.
- **Phase A runtime:** Production builds spawn the sidecar via `npx tsx` — **Node.js must be on PATH** until the sidecar is bundled (Phase B packaging task).
- **Branding:** Placeholder icons in `src-tauri/icons/` (see `src-tauri/icons/README.md`).
- **Appendix A parity:** Most features unverified until manual UAT (see `port/to-tauri.md` Appendix A).

## Where to run commands

| Task | Directory | Command |
|------|-----------|---------|
| Install frontend + Tauri deps | repo root | `corepack yarn install` |
| Tauri dev (Rust + Vite + sidecar) | repo root | `corepack yarn tauri:dev` |
| Web frontend only | repo root | `corepack yarn dev:web` |
| Production web build | repo root | `corepack yarn build:web` |
| Tauri release build | repo root | `corepack yarn tauri:build` |
| Sidecar alone (stdio JSON-RPC) | repo root | `corepack yarn sidecar:dev` |
| Sidecar boot + RPC smoke test | repo root | `corepack yarn sidecar:smoke` |
| Regenerate HTML entrypoints | repo root | `corepack yarn pages:generate` |

**Do not** run `tauri dev` from `port/sidecar/` — that directory is the Node backend only.

## Architecture rules for agents

1. **Follow the migration plan.** Prefer tasks listed in `port/to-tauri.md` over ad-hoc rewrites.
2. **Preserve provider contracts first.** Sidecar channels and `{ command, payload }` shapes must stay compatible with existing `source/app/service-providers/*` until intentionally ported.
3. **Providers never import `electron` directly in Tauri mode.** Use `port/sidecar/adapters/electron-shim.ts` (sidecar) or `port/sidecar/adapters/tauri-shim.ts` (renderer).
4. **Respect boot order** in the sidecar: Log → Config → FSAL → … (see `source/app/app-service-container.ts`).
5. **Explicit non-goal:** Simple PDF export (`simple-pdf`) is dropped — do not reintroduce it.
6. **Minimize scope.** Match existing Zettlr conventions; avoid unrelated refactors.

## Key files

```
port/to-tauri.md                    # Master migration plan
port/sidecar/main.ts                # Sidecar entry + JSON-RPC router
port/sidecar/adapters/electron-shim.ts
port/sidecar/adapters/tauri-shim.ts
port/sidecar/adapters/native-rpc.ts # Sidecar → Rust HTTP RPC
scripts/sidecar-smoke.mjs           # Sidecar boot + config RPC smoke test
src-tauri/src/lib.rs                # Tauri app setup
src-tauri/src/sidecar.rs            # Spawn Node sidecar, forward RPC
src-tauri/src/sync_http.rs          # Renderer sendSync bridge
src-tauri/src/native_rpc.rs         # Dialog/shell/clipboard/window RPC
src-tauri/src/windows.rs            # Webview window registry
vite.config.ts                      # Vite MPA build
static/pages/*.html                 # Renderer entry HTML (tauri-shim injected)
```

## Branding note

Zettlr’s brand (name, icons) is reserved upstream. This fork uses **Littlr** as the working product name (`productName` in Tauri config). Replace icons before any public release.

## License

GNU GPL v3 — same as Zettlr.
