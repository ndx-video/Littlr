# Zettlr → Tauri Migration

## Status: Phase 0 (Spike) — scaffolding

This directory (`port/`) contains the migration artifacts for porting
Zettlr from Electron to Tauri 2.

## Structure

```
port/
  to-tauri.md              # Full migration plan (living document)
  sidecar/                 # Node.js backend (Phase A)
    main.ts                # AppServiceContainer + JSON-RPC server
    adapters/              # Electron → abstract platform
      platform.ts          # Platform abstraction (paths, dialogs, shell, …)
      tauri-shim.ts        # Renderer IPC shim (replaces Electron preload)
  ipc-schema/              # Provider command schemas (Phase 2)
  spikes/                  # Time-boxed experiments
```

## Phases

| Phase | Target | ETA |
|-------|--------|-----|
| 0 Spike | Prove Tauri + sidecar + one editor window | 2–3 weeks |
| 1 Shell alpha | Tauri owns all windows; sidecar owns all providers | 6–8 weeks |
| 2 Beta + CI | Feature-complete, all windows, CI artifacts | 8–10 weeks |
| 3 Stabilize | Drop Electron, community beta | 4–6 weeks |
| 4 Rust ports | Provider-by-provider migration to Rust | 6–12+ months |

See `to-tauri.md` for full details.

## Getting started (Phase 0)

```bash
# Prerequisites
rustup default stable
cargo install tauri-cli --version "^2"

# Frontend (existing)
yarn install

# Bootstrap Tauri (from repo root)
cargo tauri init  # interactive — set devPath to Vite dev server

# Sidecar
cd port/sidecar && yarn install
```

## License

GNU GPL v3 — same as Zettlr.