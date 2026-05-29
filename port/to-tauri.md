# Zettlr → Tauri migration plan

**Status:** Draft  
**Last updated:** 2026-05-28  
**Strategy:** Tauri 2 shell + system WebView; **Node sidecar** preserves existing service providers; incremental **Rust replacement** until the sidecar can be removed.  
**Explicit drop:** Chromium-based PDF export (“Simple PDF” / `simple-pdf` writer).

---

## 1. Goals and non-goals

### Goals

| Goal | Success criterion |
|------|-------------------|
| Smaller runtime footprint | No bundled Chromium; idle RAM clearly below Electron build on same workload |
| Preserve behaviour during migration | Feature parity with current `develop` except items in non-goals |
| Reuse existing backend logic early | Node sidecar runs current `source/app/service-providers/*` with minimal rewrites |
| Clear exit path | Documented provider-by-provider Rust ports; sidecar binary shrinks over time |
| Ship on all current targets | win32/macOS/linux × x64/arm64 (same matrix as today) |

### Non-goals (this plan)

- **Simple PDF export** (`simple-pdf` / `pdf-exporter.ts` / `printToPDF`) — removed; users rely on Pandoc PDF (e.g. LaTeX) or external tools.
- **100% Rust on day one** — sidecar is intentional technical debt with a written retirement order.
- **Rewriting Vue/CodeMirror** — frontend stays; build pipeline changes.
- **Changing FSAL semantics or on-disk formats** — migration is shell + IPC only unless a port forces a small fix.

### Related scope (decide in Phase 1)

| Feature | Notes |
|---------|--------|
| `win-print` / Print command | Uses a dedicated print window, not only Simple PDF. Options: (a) `window.print()` via WebView, (b) Pandoc → HTML preview + print, (c) defer. **Not** the same as Simple PDF export. |
| `electron-devtools-installer` | Dev-only; replace with WebView inspector or drop. |
| `fix-path` (macOS PATH for child processes) | Reimplement in Rust launcher or sidecar bootstrap. |

---

## 2. Current architecture (baseline)

```
┌─────────────────────────────────────────────────────────────┐
│ Electron main (Node) — source/main.ts, source/app/*         │
│  AppServiceContainer → 17 service providers                 │
│  ipcMain.handle('<provider>', { command, payload })         │
│  FS, chokidar, citeproc (npm), nodehun, pandoc spawn, …     │
└──────────────────────────┬──────────────────────────────────┘
                           │ contextBridge + ipcRenderer
┌──────────────────────────▼──────────────────────────────────┐
│ 14 webpack renderer entry points (win-main, win-prefs, …)     │
│ Vue 3 + Pinia + CodeMirror 6                                │
└─────────────────────────────────────────────────────────────┘
```

**Boot order** (must be respected in sidecar): Log → CSS → Config → FSAL → … → Commands → Windows → … → Menu → Updates → LRT (`source/app/app-service-container.ts`).

**Electron touchpoints:** ~90+ files import `electron`; preload at `source/common/modules/preload/index.ts`.

---

## 3. Target architecture

### Phase A — Hybrid (ship candidate)

```
┌──────────────────────────────────────────────────────────────┐
│ Tauri (Rust) — src-tauri/                                    │
│  • Process lifecycle, single-instance, paths (app_data, logs) │
│  • Window manager (multi-window, labels, state)              │
│  • Native: menus, tray, dialogs, notifications, deep links   │
│  • IPC facade: tauri::command → sidecar JSON-RPC/stdio      │
│  • Bundled resources: pandoc, static/, dict/, CSL, …         │
│  • Sidecar spawn/kill/health/restart                         │
└───────────────────────────┬──────────────────────────────────┘
                            │ localhost socket / stdin JSON-RPC
┌───────────────────────────▼──────────────────────────────────┐
│ Node sidecar — port/sidecar/ (extracted from source/app/)     │
│  • AppServiceContainer (Electron APIs replaced by adapters)    │
│  • Same provider channel names + IPCAPI shapes initially       │
└───────────────────────────┬────────────────────────────────────┘
                            │ Tauri invoke (thin) or events
┌───────────────────────────▼────────────────────────────────────┐
│ WebView(s) — Vite-built Vue apps (source/win-*, source/common) │
│  • @tauri-apps/api instead of window.ipc where needed          │
│  • Optional compatibility shim: window.ipc → invoke bridge     │
└────────────────────────────────────────────────────────────────┘
```

### Phase B — Pure Rust (end state)

```
┌──────────────────────────────────────────────────────────────┐
│ Tauri (Rust) — full provider implementations in src-tauri/ │
│  • providers/ module mirrors service-providers layout        │
│  • citeproc-rs or WASM; hunspell crate; notify for watch     │
└───────────────────────────┬──────────────────────────────────┘
┌───────────────────────────▼──────────────────────────────────┐
│ WebView(s) — unchanged                                         │
└────────────────────────────────────────────────────────────────┘
```

---

## 4. Repository layout (proposed)

```
port/
  to-tauri.md              # this document
  sidecar/                 # Node backend (Phase 0+)
    package.json
    main.ts                # boots AppServiceContainer, JSON-RPC server
    adapters/              # electron → abstract platform
  ipc-schema/              # OpenAPI or JSON Schema for provider commands
  spikes/                  # time-boxed experiments (optional)

src-tauri/                 # Tauri crate (created by tauri init)
  src/
    main.rs
    lib.rs
    sidecar.rs             # spawn node, health, restart
    ipc_bridge.rs          # invoke → sidecar
    windows.rs
    menu.rs
    …
  capabilities/
  tauri.conf.json

src/                       # optional: move Vite root here later
  OR keep source/ + static/ with Vite pointing at existing tree
```

Keep `source/` during migration; introduce `src-tauri/` and `port/sidecar/` without a big-bang rename.

---

## 5. IPC and compatibility strategy

### 5.1 Preserve provider contracts first

Existing pattern (`source/app/service-providers/provider-contract.ts`):

```ts
{ command: 'get-config', payload: { key?: string } }
```

**Sidecar** continues to expose the same logical channels:

| Legacy channel | Sidecar handler | Tauri exposure |
|----------------|-----------------|----------------|
| `config-provider` | ConfigProvider | `zettlr_invoke('config-provider', msg)` |
| `documents-provider` | DocumentManager | same |
| `fsal-provider` | FSAL | same |
| … | … | … |

### 5.2 Renderer bridge (minimize Vue churn)

Phase 1–3: implement `source/common/modules/preload/tauri-shim.ts` (loaded instead of Electron preload):

```ts
// Pseudocode — keep call sites on window.ipc.*
window.ipc = {
  send: (ch, ...args) => invoke('provider_send', { ch, args }),
  sendSync: (ch, ...args) => invoke('provider_send_sync', { ch, args }),
  invoke: (ch, ...args) => invoke('provider_invoke', { ch, args }),
  on: (ch, listener) => listen(ch, listener)
}
```

Map `broadcast-ipc-message` to Tauri `emit`/`listen` on a global event bus.

### 5.3 Schema generation (Phase 2)

1. Extract `IPCAPI<T>` maps per provider into `port/ipc-schema/*.json`.
2. Rust: generate or hand-write request/response types for the bridge.
3. Sidecar: validate inbound messages in dev builds.

### 5.4 Electron adapter layer (sidecar)

Create `port/sidecar/adapters/electron.ts` implementing subsets used by providers:

| Electron API | Adapter backing |
|--------------|-----------------|
| `app.getPath`, `setPath`, `isPackaged` | Tauri paths via env vars set by Rust parent |
| `dialog.*` | RPC to Rust → `tauri-plugin-dialog` |
| `shell.openPath`, `showItemInFolder` | RPC → `tauri-plugin-opener` / `shell` |
| `BrowserWindow` | **Removed** — window ops RPC to Rust |
| `ipcMain.handle` | Sidecar JSON-RPC handlers (internal) |
| `Menu`, `Tray` | RPC to Rust |
| `nativeTheme` | RPC / `tauri-plugin-os` |
| `net` (updates) | `reqwest` in Rust or `fetch` in sidecar |
| `clipboard` | `tauri-plugin-clipboard` |
| `webUtils.getPathForFile` | Tauri drag-drop path APIs |

**Rule:** providers never import `electron` directly after adapter pass; only adapters touch platform.

---

## 6. Removing Simple PDF (concrete tasks)

| Location | Action |
|----------|--------|
| `source/app/service-providers/commands/exporter/pdf-exporter.ts` | Delete |
| `source/app/service-providers/commands/exporter/index.ts` | Remove `PDFExporter`, `simple-pdf` from `PLUGINS`, `getCustomProfiles()` entry |
| `static/defaults/` | Remove or hide `Simple PDF.yaml` if present |
| UI (`win-main/PopoverExport.vue`, preferences import/export) | Remove Simple PDF from lists; changelog entry |
| Docs / tutorial | Note PDF via Pandoc/LaTeX only |
| Tests | Delete/update exporter tests |

**Keep:** Pandoc-based PDF defaults that invoke `pdflatex`/`xelatex` on the system or in user env (unchanged).

**Communicate:** “Quick PDF without LaTeX” is gone; mitigation = document recommended Pandoc PDF profiles.

---

## 7. Phased execution plan

### Phase 0 — Spike (2–3 weeks)

**Objective:** Prove Tauri + sidecar + one editor window opens a file and saves.

| # | Task | Owner hint |
|---|------|------------|
| 0.1 | `tauri init` in repo; Tauri 2 + Vite; single window `main` | Platform |
| 0.2 | Vite entry: `source/win-main/index.ts` + `static/index.htm` | Frontend |
| 0.3 | Sidecar: minimal HTTP/stdio JSON-RPC `{ channel, message }` | Backend |
| 0.4 | Rust: spawn sidecar on boot; pass `ZETTLR_USER_DATA`, `ZETTLR_RESOURCES` | Platform |
| 0.5 | Port **only** `LogProvider` + `ConfigProvider` + stub `FSAL` read/write one file | Backend |
| 0.6 | Preload shim: `config.get` / `config.set` working | Frontend |
| 0.7 | CI job: build spike on `ubuntu-latest` only | Infra |

**Exit:** Open `.md`, edit, save, restart app, content persists.

**Risks:** WebView2 on Windows VM; path encoding on Windows.

---

### Phase 1 — Shell parity (6–8 weeks)

**Objective:** Tauri owns all windows and OS integration; sidecar owns all providers.

#### 1.1 Rust core

| # | Task |
|---|------|
| 1.1.1 | Window registry: labels matching `win-*` (`main`, `preferences`, `about`, …) |
| 1.1.2 | Multi-main-window support (Map of window id → label) |
| 1.1.3 | Window state persist (`PersistentDataContainer` path via config) |
| 1.1.4 | Single-instance + file/open argv forwarding to Rust then sidecar |
| 1.1.5 | Custom URL scheme / `zettlr://` if still required (`custom-protocols.ts`) |
| 1.1.6 | Splash / onboarding window as undecorated or child windows |
| 1.1.7 | `tauri-plugin-dialog` for all former `dialog.*` |
| 1.1.8 | `tauri-plugin-opener` + shell scope for attachments |
| 1.1.9 | Menu + tray (platform modules ported from `menu.darwin.ts` / `menu.win32.ts`) |
| 1.1.10 | Notifications (`show-notification.ts`) |
| 1.1.11 | Drag-out / show-in-folder |

#### 1.2 Sidecar extraction

| # | Task |
|---|------|
| 1.2.1 | Move `source/app/**` → `port/sidecar/app/**` (or symlink path aliases) |
| 1.2.2 | Replace `source/main.ts` lifecycle with `port/sidecar/main.ts` |
| 1.2.3 | Implement electron adapters (section 5.4) |
| 1.2.4 | Remove `WindowProvider`’s `BrowserWindow` — window commands become RPC to Rust |
| 1.2.5 | Wire **full** `AppServiceContainer.boot()` order |
| 1.2.6 | Package sidecar with `pkg` / `esbuild` bundle + `nodehun.node` per target |
| 1.2.7 | Bundle Pandoc in `tauri.conf.json` > `bundle.resources` (port `forge.config.js` logic) |

#### 1.3 Frontend build

| # | Task |
|---|------|
| 1.3.1 | Replace Electron Forge webpack with **Vite multi-page build** (14 entries) |
| 1.3.2 | Shared chunks for `source/common/**` |
| 1.3.3 | Drop Electron forge devtools installer; document WebView debug |
| 1.3.4 | `window-register` — remove Electron-only APIs |
| 1.3.5 | Global shim for `window.ipc` |

#### 1.4 PDF removal (this phase)

Complete section 6; release note draft.

**Exit:** Daily-driver alpha: main editor, prefs, file tree, export (non–Simple PDF), import, tags.

---

### Phase 2 — Feature-complete beta (8–10 weeks)

**Objective:** All windows and commands; updater; CI for six artifacts.

| Area | Tasks |
|------|--------|
| **Windows** | `win-assets`, `win-tag-manager`, `win-project-properties`, `win-stats`, `win-log-viewer`, `win-update`, `win-error`, `win-paste-image`, `win-about` |
| **Editor** | CodeMirror IPC (`markdown-editor/util/ipc-api.ts`), spellcheck linter, LanguageTool, citeproc sync callbacks in shim |
| **Citeproc** | Keep in sidecar; ensure sync path perf acceptable |
| **Dictionary** | Keep `nodehun` in sidecar; verify webpack/asset copy → esbuild native addon |
| **Updates** | `tauri-plugin-updater` in Rust; port `updates/index.ts` logic (semver, assets, signatures) |
| **Print** | Decide 1.4 scope; implement minimal print or hide menu item |
| **CLI flags** | Port `cli-provider.ts` via Rust clap → env to sidecar |
| **PATH / Pandoc** | Port `add-to-PATH`, `environment-check` |
| **CI** | Replace `.github/workflows/build.yml` Electron jobs with `tauri build` matrix |
| **Signing** | macOS notarize, Windows sign, Linux AppImage/deb |

**Exit:** Community beta; parity checklist (appendix A) ≥ 95%.

---

### Phase 3 — Stabilization (4–6 weeks)

| # | Task |
|---|------|
| 3.1 | Performance: IPC batching, reduce `sendSync` hot paths |
| 3.2 | Sidecar crash recovery (supervisor restart, user dialog) |
| 3.3 | Security audit: Tauri capabilities, CSP, sidecar localhost only |
| 3.4 | Migration doc for contributors (README, directory structure) |
| 3.5 | Remove Electron deps, `forge.config.js`, `webpack.*`, `main.ts` electron entry |
| 3.6 | Rename branch/product strings; update issue templates |

**Exit:** Electron deprecated on `develop`; releases from Tauri.

---

### Phase 4 — Rust provider migration (ongoing, 6–12+ months)

Migrate sidecar providers to Rust **in dependency order** (low risk first). After each port, sidecar delegates to Rust via internal RPC or removes module.

#### Recommended port order

| Order | Provider | Rust crates / notes | Complexity |
|-------|----------|---------------------|------------|
| R1 | `log` | `tracing`, file append | S |
| R2 | `css` | File IO | S |
| R3 | `recent-docs` | JSON store | S |
| R4 | `stats` | File IO | S |
| R5 | `appearance` | Theme events via Tauri | M |
| R6 | `assets` | File IO + static paths | M |
| R7 | `config` | `serde` + dirs; onboarding UI stays web | M |
| R8 | `tags` | In-memory + FSAL hooks | M |
| R9 | `targets` | FSAL-dependent | M |
| R10 | `links` | FSAL + HTTP `reqwest` | M |
| R11 | `fsal` | `notify`, `walkdir`, `serde`; **largest** | **XL** |
| R12 | `documents` | Tab tree atop FSAL | L |
| R13 | `dictionary` | `hunspell-rs` / `spellcheck`; retire `nodehun` | L |
| R14 | `citeproc` | `citeproc-rs` + CSL assets; validate CSL output parity | **XL** |
| R15 | `commands` + exporter | `tokio::process` for pandoc; no Simple PDF | L |
| R16 | `updates` | Already in Rust if done in Phase 2 | M |
| R17 | `long-running-tasks` | Job queue in Rust | M |

**Per-port definition of done:**

1. Rust unit + integration tests cover provider commands.
2. Sidecar route removed; Tauri `invoke` calls Rust directly.
3. No regression in appendix A checklist items for that provider.
4. Binary size of sidecar decreases measurably.

**Final:** Delete `port/sidecar/`; single `src-tauri` binary.

---

## 8. Window mapping

| Electron entry (`forge.config.js`) | Tauri window label | Notes |
|-----------------------------------|-------------------|--------|
| `win-main` | `main-{id}` | Multiple instances |
| `win-preferences` | `preferences` | Singleton |
| `win-about` | `about` | Singleton |
| `win-assets` | `assets` | Singleton |
| `win-tag-manager` | `tag-manager` | Singleton |
| `win-project-properties` | `project-properties-{id}` | Per project |
| `win-stats` | `stats` | Singleton |
| `win-log-viewer` | `log-viewer` | Singleton |
| `win-update` | `update` | Singleton |
| `win-print` | `print` | Optional / deferred |
| `win-paste-image` | `paste-image` | Modal |
| `win-error` | `error` | Modal |
| `win-onboarding` | `onboarding` | First-run |
| `win-splash-screen` | `splash` | Or Rust splash only |

Each window loads the same Vite MPA HTML with query `?window=win-main` or separate built HTML per entry.

---

## 9. Build, bundle, and release

### 9.1 Resources (from `static/`, `resources/`)

| Asset | Bundle via |
|-------|------------|
| Pandoc binary | `tauri.conf.json` `resources` + platform matrix (port `downloadPandoc` script) |
| `static/dict`, CSL, defaults, lang, tutorial | `resources` |
| `nodehun` dictionaries + `.node` | Sidecar until R13; then hunspell data only |

### 9.2 Environment variables

| Variable | Purpose |
|----------|---------|
| `ZETTLR_USER_DATA` | Config dir (replaces `app.getPath('userData')`) |
| `ZETTLR_RESOURCES` | Read-only bundled assets |
| `ZETTLR_SIDECAR_SOCKET` | IPC endpoint |
| `GIT_COMMIT_HASH` | Keep from `scripts/get-git-hash.js` |
| `BUNDLE_PANDOC=0` | Packagers without bundled Pandoc |
| `ZETTLR_DISABLE_UPDATE_CHECK` | Same semantics as today |

### 9.3 CI matrix (replace Electron)

| Job | Target |
|-----|--------|
| `tauri-build-linux-x64` | AppImage/deb |
| `tauri-build-linux-arm64` | arm64 |
| `tauri-build-macos-x64` | x64 DMG |
| `tauri-build-macos-arm64` | Apple Silicon |
| `tauri-build-windows-x64` | NSIS/MSI |
| `tauri-build-windows-arm64` | arm64 |

Keep `check.yml` (lint, unit tests); add `port/sidecar` test job.

### 9.4 Developer workflow

```bash
# Target end state
yarn install          # frontend + sidecar deps
yarn dev:web          # Vite HMR
cargo tauri dev       # Rust + sidecar + webview
```

During Phase 0–1, document platform deps: Rust stable, WebView2 (Windows), `webkit2gtk` (Linux).

---

## 10. Testing strategy

| Layer | What |
|-------|------|
| Unit | Existing `test/` — keep; mock platform adapter not Electron |
| Sidecar | Provider contract tests over JSON-RPC |
| Rust | `cargo test` for window state, path helpers, IPC bridge |
| E2E | Optional: `tauri-driver` or Playwright against webview — open file, export MD→HTML |
| Manual matrix | Appendix A on each platform before release |
| Parity | Citation render golden files; export HTML diff; spellcheck suggestions |

**Regression focus after PDF removal:** export dialog no longer offers Simple PDF; Pandoc PDF profiles still work when LaTeX installed.

---

## 11. Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Sidecar + WebView = two runtimes | RAM still better than Electron, worse than pure Rust | Track metrics; aggressive Rust port order |
| `sendSync` blocks webview | UI jank | Replace with async `invoke` per provider method |
| `nodehun` packaging on arm64 | Spellcheck missing | CI build matrix test; fallback aspell CLI |
| citeproc-rs ≠ citeproc-js | Wrong citations | Golden tests before R14; keep sidecar citeproc until parity |
| Linux WebKitGTK version fragmentation | Render glitches | Document minimum WebKit; test Ubuntu LTS + Fedora |
| Windows ARM | Pandoc bundle | Same rules as `forge.config.js` |
| Contributor friction | Slower PRs | Adapter docs; dual-run not required after Phase 3 |
| GPL + Tauri | License OK | Tauri MIT/Apache + app GPL v3 — no conflict |

---

## 12. Timeline (indicative)

| Phase | Calendar | Cumulative |
|-------|----------|------------|
| 0 Spike | 2–3 weeks | 3 weeks |
| 1 Shell alpha | 6–8 weeks | 2–3 months |
| 2 Beta + CI | 8–10 weeks | 4–5 months |
| 3 Stabilize, drop Electron | 4–6 weeks | **~6 months** to production cutover |
| 4 Rust ports | 6–12+ months | Sidecar gone **~12–18 months** |

Assumes 1–2 experienced contributors part-time on port; full-time core team halves wall time.

---

## 13. Decision log

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Tauri 2 | Multi-window, plugin ecosystem, active docs |
| D2 | Node sidecar first | Preserves FSAL, citeproc, nodehun, 17 providers |
| D3 | Drop Simple PDF | Requires Chromium `printToPDF`; Pandoc PDF remains |
| D4 | `window.ipc` shim | Avoid editing 100+ renderer call sites early |
| D5 | Vite replaces Forge webpack | Tauri standard; MPA for 14 windows |
| D6 | FSAL ported late (R11) | Highest concentration of Node logic |
| D7 | citeproc ported late (R14) | Hardest parity surface |

### Open questions (resolve in Phase 0–1)

1. Sidecar IPC: stdio JSON-RPC vs localhost TCP vs Tauri inter-process plugin?
2. Print window: ship, defer, or remove with Simple PDF?
3. Onboarding: web window vs Rust-native screen?
4. Auto-update: **deferred** — Tauri updater plugin needs signed endpoint; custom `UpdateProvider` remains until wired.

---

## Appendix A — Parity checklist (beta gate)

Status key: `[x]` verified in dev, `[~]` partial / needs UAT, `[ ]` not verified.

- [~] Single-instance / CLI open files (Rust plugin wired; needs UAT)
- [ ] Custom `userData` path flag
- [~] File watcher + FSAL CRUD (sidecar FSAL boots; needs UAT)
- [ ] Multi-root workspaces
- [ ] Editor: syntax, lint, autocomplete, vim/emacs modes
- [ ] Citations (live preview + export)
- [ ] Spellcheck + user dictionary
- [ ] Export/import (Pandoc, Textbundle; **no Simple PDF**)
- [ ] Global search
- [ ] Tags + tag manager
- [ ] Assets manager + snippets
- [ ] Preferences (all tabs)
- [ ] Project properties
- [ ] Statistics
- [ ] Log viewer
- [ ] Updater (deferred — no Tauri updater endpoint yet)
- [ ] Tray (where supported)
- [ ] Platform menus (macOS app menu)
- [ ] Dark/light/system themes + custom CSS
- [ ] LanguageTool (if enabled)
- [ ] Tutorial first-run copy
- [ ] ARM + x64 builds for win/mac/linux (CI matrix present; needs green runs + UAT)

---

## Appendix B — Files to delete at Electron sunset (Phase 3)

- `forge.config.js`
- `webpack.main.config.js`, `webpack.renderer.config.js`, `webpack.rules.js`
- `source/main.ts` (Electron entry)
- `electron` devDependencies in `package.json`
- `source/app/service-providers/commands/exporter/pdf-exporter.ts` (Phase 1)
- `.webpack/` output dir from gitignore docs

---

## Appendix C — Communication

**User-facing (4.x → Tauri major):**

- Smaller download and lower memory use.
- PDF: use Pandoc/LaTeX profiles; “Simple PDF” removed.
- First Tauri builds may require WebView2 (Windows) — installer should bootstrap if missing.

**Contributor-facing:**

- New paths: `src-tauri/`, `port/sidecar/`.
- Providers: implement against `adapters/platform`, not Electron.
- See `port/to-tauri.md` for phase and Rust port order.

---

*This plan is a living document. Update phase exit criteria and appendix A as spikes invalidate assumptions.*
