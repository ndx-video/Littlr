# Zettlr → Tauri Migration

## Status: Phase 3 — Tauri-only release path

This directory (`port/`) contains the migration artifacts for porting
Zettlr from Electron to Tauri 2.

**This repo is a fork (Littlr)** whose primary goal is executing
[`to-tauri.md`](to-tauri.md). See [`../AGENTS.md`](../AGENTS.md) for agent
and contributor orientation.

## Structure

```
port/
  to-tauri.md              # Full migration plan (living document)
  sidecar/                 # Node.js backend (Phase A)
    main.ts                # AppServiceContainer + JSON-RPC server
    adapters/              # Electron → Tauri bridges
      electron-shim.ts     # Sidecar: electron API → native RPC
      tauri-shim.ts        # Renderer: window.ipc / window.config
      native-rpc.ts        # Sidecar → Rust HTTP RPC client
  ipc-schema/              # Provider command schemas (Phase 2)
  spikes/                  # Time-boxed experiments
```

## Phases

| Phase | Target | Status |
|-------|--------|--------|
| 0 Spike | Prove Tauri + sidecar + editor window | Done |
| 1 Shell alpha | Tauri owns windows; sidecar owns providers | Done |
| 2 Beta + CI | Feature-complete, CI artifacts | Done (baseline) |
| 3 Stabilize | Drop Electron, Tauri-only workflow | Done |
| 4 Rust ports | Provider-by-provider migration to Rust | Future |

See `to-tauri.md` for full details.

## Getting started

```powershell
# Repo root
cd E:\path\to\Littlr
corepack yarn install

# Tauri dev — Rust shell + Vite + sidecar
corepack yarn tauri:dev

# Sidecar alone (stdio JSON-RPC debugging)
corepack yarn sidecar:dev

# Release build
corepack yarn tauri:build
```

### Directory cheat sheet

| What | Where to run |
|------|----------------|
| `corepack yarn tauri:dev` | **repo root** |
| `corepack yarn sidecar:dev` | **repo root** |
| `corepack yarn build:web` | **repo root** |

Do **not** run `tauri dev` from `port/sidecar/` — that folder is the Node backend, not the Tauri app.

## CI

- **Spike / PR validation:** `.github/workflows/tauri-spike.yml` (web build, `yarn sidecar:smoke`, Linux `tauri:build`)
- **Release matrix:** `.github/workflows/tauri-build.yml`

Legacy Electron workflows (`.github/workflows/build.yml`) are **manual-only** (`workflow_dispatch`) after Phase 3.

## Phase A production note

Release builds (`yarn tauri:build`) bundle the web frontend into `dist/` and produce platform installers, but the **Node sidecar still runs via `npx tsx` at runtime**. End users need Node.js on `PATH` until the sidecar is packaged (future Phase B task). Dev machines already have Node for `yarn`.

## License

GNU GPL v3 — same as Zettlr.
