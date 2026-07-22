/**
 * Electron API shim — allows Zettlr service providers to run in the
 * Node.js sidecar without a real Electron runtime.
 *
 * This module is loaded INSTEAD of the real 'electron' package when the
 * sidecar runs. It provides the minimal API surface that providers use,
 * delegating to Rust via RPC or Node.js builtins where possible.
 *
 * Phase A: Stub implementations with TODO markers for Rust RPC.
 * Phase B: Providers migrate to Rust → this shim shrinks.
 *
 * @license GNU GPL v3
 */

import { EventEmitter } from 'node:events'
import path from 'node:path'

// ---------------------------------------------------------------------------
// app — application lifecycle and paths
// ---------------------------------------------------------------------------

let appPath: Record<string, string> = {}

export const app = {
  getVersion: (): string => '5.0.0-tauri-dev',

  getPath: (name: string): string => {
    // Map Electron path names to env vars set by Rust parent
    const envMap: Record<string, string> = {
      userData: process.env.ZETTLR_USER_DATA ?? path.join(process.cwd(), '.zettlr-data'),
      userCache: process.env.ZETTLR_CACHE ?? path.join(process.cwd(), '.zettlr-cache'),
      logs: process.env.ZETTLR_LOGS ?? path.join(process.cwd(), '.zettlr-logs'),
      appData: process.env.ZETTLR_USER_DATA ?? path.join(process.cwd(), '.zettlr-data'),
      documents: process.env.HOME ?? process.env.USERPROFILE ?? '/tmp',
      downloads: process.env.HOME ?? process.env.USERPROFILE ?? '/tmp',
      temp: process.env.TMPDIR ?? '/tmp',
      exe: process.argv[0],
      home: process.env.HOME ?? process.env.USERPROFILE ?? '/tmp',
      desktop: path.join(process.env.HOME ?? '/tmp', 'Desktop'),
    }
    return appPath[name] ?? envMap[name] ?? path.join(process.cwd(), '.zettlr-data')
  },

  setPath: (name: string, p: string): void => {
    appPath[name] = p
  },

  isPackaged: false,

  getName: (): string => 'Littlr',

  on: (_event: string, _listener: (...args: any[]) => void): void => {
    // TODO: Wire to Tauri lifecycle events
  },

  whenReady: (): Promise<void> => Promise.resolve(),

  quit: (): void => {
    process.exit(0)
  },
}

// ---------------------------------------------------------------------------
// ipcMain — provider command dispatch
// ---------------------------------------------------------------------------

const ipcHandlers = new Map<string, (event: any, message: any) => any>()

export const ipcMain = {
  handle: (channel: string, handler: (event: any, message: any) => any): void => {
    ipcHandlers.set(channel, handler)
  },

  // Called by the sidecar's JSON-RPC router
  _dispatch: async (channel: string, message: any): Promise<any> => {
    const handler = ipcHandlers.get(channel)
    if (!handler) {
      throw new Error(`No handler for channel: ${channel}`)
    }
    return handler({}, message)
  },

  _hasHandler: (channel: string): boolean => {
    return ipcHandlers.has(channel)
  },
}

// ---------------------------------------------------------------------------
// dialog — native dialogs (TODO: RPC to Rust)
// ---------------------------------------------------------------------------

export const dialog = {
  showMessageBox: async (_opts: any): Promise<{ response: number }> => {
    // TODO Phase 1.1.7: RPC to tauri-plugin-dialog
    console.warn('[electron-shim] dialog.showMessageBox not implemented')
    return { response: 0 }
  },
  showOpenDialog: async (_opts: any): Promise<{ filePaths: string[]; canceled: boolean }> => {
    console.warn('[electron-shim] dialog.showOpenDialog not implemented')
    return { filePaths: [], canceled: true }
  },
  showSaveDialog: async (_opts: any): Promise<{ filePath?: string; canceled: boolean }> => {
    console.warn('[electron-shim] dialog.showSaveDialog not implemented')
    return { canceled: true }
  },
  showErrorBox: (title: string, content: string): void => {
    console.error(`[electron-shim] ERROR: ${title} — ${content}`)
  },
}

// ---------------------------------------------------------------------------
// BrowserWindow — window management (TODO: RPC to Rust)
// ---------------------------------------------------------------------------

export class BrowserWindow {
  constructor(_opts?: any) {
    // TODO Phase 1.2.4: WindowProvider becomes RPC client
    console.warn('[electron-shim] BrowserWindow stub created')
  }
  loadURL = (_url: string): Promise<void> => Promise.resolve()
  loadFile = (_file: string): Promise<void> => Promise.resolve()
  on = (_event: string, _listener: (...args: any[]) => void): void => {}
  show = (): void => {}
  close = (): void => {}
  focus = (): void => {}
  setTitle = (_title: string): void => {}
  webContents = { send: (_ch: string, ..._args: any[]): void => {} }
  static getAllWindows = (): BrowserWindow[] => []
  static getFocusedWindow = (): BrowserWindow | null => null
}

// ---------------------------------------------------------------------------
// shell — open files/folders (TODO: RPC to Rust)
// ---------------------------------------------------------------------------

export const shell = {
  openPath: async (_p: string): Promise<string> => {
    console.warn('[electron-shim] shell.openPath not implemented:', _p)
    return ''
  },
  showItemInFolder: (_p: string): void => {
    console.warn('[electron-shim] shell.showItemInFolder not implemented:', _p)
  },
  openExternal: async (_url: string): Promise<void> => {
    console.warn('[electron-shim] shell.openExternal not implemented:', _url)
  },
}

// ---------------------------------------------------------------------------
// clipboard (TODO: RPC to Rust via tauri-plugin-clipboard)
// ---------------------------------------------------------------------------

export const clipboard = {
  writeText: (_text: string): void => {},
  readText: (): string => '',
  writeHTML: (_html: string): void => {},
  readHTML: (): string => '',
}

// ---------------------------------------------------------------------------
// nativeTheme (TODO: RPC to Rust via tauri-plugin-os)
// ---------------------------------------------------------------------------

export const nativeTheme = {
  get shouldUseDarkColors(): boolean { return false },
  get shouldUseHighContrastColors(): boolean { return false },
  get themeSource(): string { return 'system' },
  on: (_event: string, _listener: (...args: any[]) => void): void => {},
}

// ---------------------------------------------------------------------------
// webUtils — file path from drag-drop (Tauri provides natively)
// ---------------------------------------------------------------------------

export const webUtils = {
  getPathForFile: (_file: File): string => '',
}

// ---------------------------------------------------------------------------
// net — HTTP client for updates (TODO: Rust reqwest or fetch)
// ---------------------------------------------------------------------------

export const net = {
  request: async (_opts: any): Promise<any> => {
    console.warn('[electron-shim] net.request not implemented')
    return { on: () => {}, end: () => {} }
  },
  fetch: async (url: string, opts?: any): Promise<Response> => {
    return fetch(url, opts)
  },
}

// ---------------------------------------------------------------------------
// contextBridge — no-op in sidecar (renderer uses tauri-shim)
// ---------------------------------------------------------------------------

export const contextBridge = {
  exposeInMainWorld: (_key: string, _api: any): void => {},
}

// ---------------------------------------------------------------------------
// ipcRenderer — no-op in sidecar (renderer uses tauri-shim)
// ---------------------------------------------------------------------------

export const ipcRenderer = {
  send: (): void => {},
  sendSync: (): any => undefined,
  invoke: async (): Promise<any> => undefined,
  on: (): void => {},
  off: (): void => {},
  setMaxListeners: (): void => {},
}