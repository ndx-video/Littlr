/**
 * Platform adapter — abstracts Electron APIs behind a common interface.
 *
 * During Phase A, this delegates to Tauri's Rust shell via RPC.
 * The sidecar NEVER imports 'electron' directly — only this adapter does.
 *
 * When a provider is fully ported to Rust (Phase B), its adapter calls are
 * removed entirely and the Tauri invoke goes directly to Rust.
 *
 * @license GNU GPL v3
 */

// ---------------------------------------------------------------------------
// Paths — injected by Rust parent via env vars
// ---------------------------------------------------------------------------

export function getUserDataPath(): string {
  return process.env.ZETTLR_USER_DATA ?? ''
}

export function getResourcesPath(): string {
  return process.env.ZETTLR_RESOURCES ?? ''
}

export function getLogsPath(): string {
  return process.env.ZETTLR_LOGS ?? ''
}

// ---------------------------------------------------------------------------
// Dialogs — RPC to Rust (tauri-plugin-dialog)
// ---------------------------------------------------------------------------

// TODO Phase 1.1.7: Implement dialog RPC bridge
// export async function showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogReturnValue>
// export async function showSaveDialog(options: SaveDialogOptions): Promise<SaveDialogReturnValue>
// export async function showMessageBox(options: MessageBoxOptions): Promise<MessageBoxReturnValue>

// ---------------------------------------------------------------------------
// Shell — RPC to Rust (tauri-plugin-opener)
// ---------------------------------------------------------------------------

// TODO Phase 1.1.8: Implement shell open RPC bridge
// export async function openPath(p: string): Promise<void>
// export async function showItemInFolder(p: string): Promise<void>

// ---------------------------------------------------------------------------
// Clipboard — RPC to Rust (tauri-plugin-clipboard)
// ---------------------------------------------------------------------------

// TODO Phase 2: Implement clipboard RPC bridge

// ---------------------------------------------------------------------------
// Window management — RPC to Rust (window labels)
// ---------------------------------------------------------------------------
// WindowProvider in Electron creates BrowserWindow instances.
// In Tauri, windows are managed by Rust. The sidecar sends window commands
// via RPC: open(label), close(label), focus(label), setTitle(label, title)
// The WindowProvider becomes an RPC client, not a BrowserWindow factory.

// TODO Phase 1.2.4: Replace WindowProvider's BrowserWindow with RPC

// ---------------------------------------------------------------------------
// Notifications — RPC to Rust
// ---------------------------------------------------------------------------

// TODO Phase 1.1.10

// ---------------------------------------------------------------------------
// Drag-drop file paths — provided by Tauri natively
// ---------------------------------------------------------------------------

// getPathForFile was webUtils.getPathForFile in Electron.
// Tauri exposes file drop paths directly in the webview event.
// This adapter is only needed if sidecar needs to resolve paths.
// Renderer uses Tauri's built-in drag-drop API instead.

// ---------------------------------------------------------------------------
// Native theme — RPC to Rust (tauri-plugin-os)
// ---------------------------------------------------------------------------

// TODO Phase 1.1
// export function getNativeTheme(): 'light' | 'dark' | 'system'