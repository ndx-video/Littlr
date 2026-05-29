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
import { nativeRpcSync } from './native-rpc'

function canNativeRpc (): boolean {
  return process.env.LITTLR_TAURI === '1' &&
    process.env.LITTLR_NATIVE_RPC_PORT !== undefined &&
    process.env.LITTLR_NATIVE_RPC_PORT !== ''
}

function pageFromUrl (url: string): string {
  try {
    const parsed = new URL(url)
    const segment = parsed.pathname.split('/').pop() ?? 'main.html'
    return segment.replace(/\.html$/, '')
  } catch {
    return 'main'
  }
}

// ---------------------------------------------------------------------------
// app — application lifecycle and paths
// ---------------------------------------------------------------------------

let appPath: Record<string, string> = {}

export const app = {
  getVersion: (): string => '5.0.0-tauri-dev',

  getLocale: (): string => process.env.LANG?.split('.')[0] ?? 'en-US',

  getFileIcon: async (_filePath: string): Promise<{ toDataURL: () => string }> => ({
    toDataURL: () => ''
  }),

  getPath: (name: string): string => {
    // Map Electron path names to env vars set by Rust parent
    const envMap: Record<string, string> = {
      userData: process.env.ZETTLR_USER_DATA ?? path.join(process.cwd(), '.zettlr-data'),
      userCache: process.env.ZETTLR_CACHE ?? path.join(process.cwd(), '.zettlr-cache'),
      logs: process.env.ZETTLR_LOGS ?? path.join(process.cwd(), '.zettlr-logs'),
      appData: process.env.ZETTLR_USER_DATA ?? path.join(process.cwd(), '.zettlr-data'),
      documents: process.env.HOME ?? process.env.USERPROFILE ?? 'C:\\Users\\Public',
      downloads: process.env.HOME ?? process.env.USERPROFILE ?? 'C:\\Users\\Public',
      temp: process.env.TEMP ?? process.env.TMP ?? 'C:\\Windows\\Temp',
      exe: process.argv[0],
      home: process.env.HOME ?? process.env.USERPROFILE ?? 'C:\\Users\\Public',
      desktop: path.join(process.env.USERPROFILE ?? 'C:\\Users\\Public', 'Desktop'),
      resourcesPath: process.env.ZETTLR_RESOURCES ?? path.join(process.cwd(), 'static'),
    }
    return appPath[name] ?? envMap[name] ?? path.join(process.cwd(), '.zettlr-data')
  },

  setPath: (name: string, p: string): void => {
    appPath[name] = p
  },

  setAppLogsPath: (p: string): void => {
    appPath.logs = p
  },

  setAppUserModelId: (_id: string): void => {},

  isPackaged: false,

  getName: (): string => 'Littlr',

  on: (_event: string, _listener: (...args: any[]) => void): void => {},

  whenReady: (): Promise<void> => Promise.resolve(),

  quit: (): void => {
    process.exit(0)
  },

  exit: (code?: number): void => {
    process.exit(code ?? 0)
  },

  disableHardwareAcceleration: (): void => {},

  requestSingleInstanceLock: (): boolean => true,

  setAboutPanelOptions: (_opts: any): void => {},

  getRecentDocuments: (): string[] => [],

  addRecentDocument: (_docPath: string): void => {},

  clearRecentDocuments: (): void => {},
}

// ---------------------------------------------------------------------------
// ipcMain — provider command dispatch
// ---------------------------------------------------------------------------

const ipcHandlers = new Map<string, (event: any, message: any) => any>()
const ipcSyncHandlers = new Map<string, (event: any, message: any) => void>()

export const ipcMain = {
  handle: (channel: string, handler: (event: any, message: any) => any): void => {
    ipcHandlers.set(channel, handler)
  },

  on: (channel: string, handler: (event: any, message: any) => void): void => {
    ipcSyncHandlers.set(channel, handler)
  },

  _dispatch: async (channel: string, message: any): Promise<any> => {
    const handler = ipcHandlers.get(channel)
    if (handler !== undefined) {
      return handler({}, message)
    }
    return ipcMain._dispatchSync(channel, message)
  },

  _dispatchSync: (channel: string, message: any): any => {
    const syncHandler = ipcSyncHandlers.get(channel)
    if (syncHandler !== undefined) {
      const event = { returnValue: undefined as any }
      syncHandler(event, message)
      return event.returnValue
    }

    const handler = ipcHandlers.get(channel)
    if (handler !== undefined) {
      return handler({}, message)
    }

    throw new Error(`No handler for channel: ${channel}`)
  },

  _hasHandler: (channel: string): boolean => {
    return ipcHandlers.has(channel) || ipcSyncHandlers.has(channel)
  },
}

// ---------------------------------------------------------------------------
// dialog — native dialogs (TODO: RPC to Rust)
// ---------------------------------------------------------------------------

export const dialog = {
  showMessageBox: async (opts: any): Promise<{ response: number }> => {
    if (canNativeRpc()) {
      return nativeRpcSync('dialog.showMessageBox', opts) as { response: number }
    }
    return { response: 0 }
  },
  showOpenDialog: async (opts: any): Promise<{ filePaths: string[]; canceled: boolean }> => {
    if (canNativeRpc()) {
      return nativeRpcSync('dialog.showOpenDialog', opts) as { filePaths: string[]; canceled: boolean }
    }
    return { filePaths: [], canceled: true }
  },
  showSaveDialog: async (opts: any): Promise<{ filePath?: string; canceled: boolean }> => {
    if (canNativeRpc()) {
      return nativeRpcSync('dialog.showSaveDialog', opts) as { filePath?: string; canceled: boolean }
    }
    return { canceled: true }
  },
  showErrorBox: (title: string, content: string): void => {
    console.error(`[electron-shim] ERROR: ${title} — ${content}`)
  },
}

let nextWindowId = 0
const windowInstances = new Map<string, BrowserWindow>()

const defaultDisplay = {
  id: 0,
  workArea: { x: 0, y: 0, width: 1280, height: 800 },
  bounds: { x: 0, y: 0, width: 1280, height: 800 }
}

export class BrowserWindow {
  readonly id: string
  private listeners: Record<string, Array<(...args: any[]) => void>> = {}
  private bounds = { x: 0, y: 0, width: 960, height: 640 }
  private maximized = false
  private visible = false

  constructor (opts?: any) {
    nextWindowId += 1
    this.id = nextWindowId === 1 ? 'main' : String(nextWindowId)
    if (opts?.width !== undefined) this.bounds.width = opts.width
    if (opts?.height !== undefined) this.bounds.height = opts.height
    if (opts?.x !== undefined) this.bounds.x = opts.x
    if (opts?.y !== undefined) this.bounds.y = opts.y
    windowInstances.set(this.id, this)
    if (canNativeRpc()) {
      nativeRpcSync('window.create', {
        id: this.id,
        title: opts?.title ?? 'Littlr',
        width: this.bounds.width,
        height: this.bounds.height,
        page: 'main'
      })
    }
  }

  loadURL = (url: string): Promise<void> => {
    if (canNativeRpc()) {
      nativeRpcSync('window.loadUrl', { id: this.id, url })
    }
    queueMicrotask(() => this.emit('ready-to-show'))
    return Promise.resolve()
  }

  loadFile = (file: string): Promise<void> => this.loadURL(file)

  once = (event: string, listener: (...args: any[]) => void): void => {
    const wrapper = (...args: any[]): void => {
      listener(...args)
      const list = this.listeners[event]
      if (list !== undefined) {
        this.listeners[event] = list.filter(item => item !== wrapper)
      }
    }
    this.on(event, wrapper)
  }

  on = (event: string, listener: (...args: any[]) => void): void => {
    if (this.listeners[event] === undefined) {
      this.listeners[event] = []
    }
    this.listeners[event].push(listener)
  }

  private emit (event: string, ...args: any[]): void {
    for (const listener of this.listeners[event] ?? []) {
      listener(...args)
    }
  }

  show = (): void => {
    if (this.visible) {
      return
    }
    this.visible = true
    if (canNativeRpc()) {
      nativeRpcSync('window.show', { id: this.id })
    }
  }

  hide = (): void => { this.visible = false }

  destroy = (): void => {
    if (canNativeRpc()) {
      nativeRpcSync('window.close', { id: this.id })
    }
    windowInstances.delete(this.id)
    this.emit('closed')
  }

  close = (): void => { this.destroy() }
  focus = (): void => { this.show() }
  maximize = (): void => { this.maximized = true }
  unmaximize = (): void => { this.maximized = false }
  isMaximized = (): boolean => this.maximized
  isMinimized = (): boolean => false
  isVisible = (): boolean => this.visible
  getBounds = (): { x: number, y: number, width: number, height: number } => ({ ...this.bounds })
  setBounds = (bounds: Partial<{ x: number, y: number, width: number, height: number }>): void => {
    this.bounds = { ...this.bounds, ...bounds }
  }

  setTitle = (title: string): void => {
    if (canNativeRpc()) {
      nativeRpcSync('window.setTitle', { id: this.id, title })
    }
  }

  webContents = {
    send: (channel: string, ...args: any[]): void => {
      if (canNativeRpc()) {
        nativeRpcSync('window.send', {
          id: this.id,
          channel,
          payload: args.length === 1 ? args[0] : args
        })
      }
    },
    on: (event: string, listener: (...args: any[]) => void): void => {
      if (event === 'console-message') {
        this.listeners['console-message'] = [listener]
      }
    },
    setWindowOpenHandler: (_handler: any): void => {},
    session: {
      clearStorageData: async (_opts: any): Promise<void> => Promise.resolve()
    }
  }

  static getAllWindows = (): BrowserWindow[] => Array.from(windowInstances.values())
  static getFocusedWindow = (): BrowserWindow | null => windowInstances.values().next().value ?? null
}

// ---------------------------------------------------------------------------
// shell — open files/folders (TODO: RPC to Rust)
// ---------------------------------------------------------------------------

export const shell = {
  openPath: async (targetPath: string): Promise<string> => {
    if (canNativeRpc()) {
      return nativeRpcSync('shell.openPath', { path: targetPath }) as string
    }
    return ''
  },
  showItemInFolder: (targetPath: string): void => {
    if (canNativeRpc()) {
      nativeRpcSync('shell.showItemInFolder', { path: targetPath })
    }
  },
  openExternal: async (url: string): Promise<void> => {
    if (canNativeRpc()) {
      nativeRpcSync('shell.openExternal', { url })
    }
  },
}

// ---------------------------------------------------------------------------
// clipboard (TODO: RPC to Rust via tauri-plugin-clipboard)
// ---------------------------------------------------------------------------

export const clipboard = {
  writeText: (text: string): void => {
    if (canNativeRpc()) {
      nativeRpcSync('clipboard.writeText', { text })
    }
  },
  readText: (): string => {
    if (canNativeRpc()) {
      return nativeRpcSync('clipboard.readText', {}) as string
    }
    return ''
  },
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

export const nativeImage = {
  createFromPath: (_p: string) => ({ isEmpty: () => true }),
  createEmpty: () => ({ isEmpty: () => true })
}

export class Notification {
  static isSupported (): boolean { return false }
  constructor (_opts?: any) {}
  show (): void {}
  on (_event: string, _listener: (...args: any[]) => void): void {}
}

export const screen = {
  getPrimaryDisplay: () => ({ ...defaultDisplay }),
  getAllDisplays: () => [{ ...defaultDisplay }],
  getDisplayMatching: (_bounds: { x: number, y: number, width: number, height: number }) => ({ ...defaultDisplay })
}

export class Menu {
  static buildFromTemplate (_template: any[]): Menu { return new Menu() }
  static setApplicationMenu (_menu: Menu | null): void {}
  static getApplicationMenu (): Menu | null { return new Menu() }
  items: any[] = []
}

export class MenuItem {
  constructor (_opts?: any) {}
}

export const protocol = {
  registerSchemesAsPrivileged: (_schemes: any[]): void => {},
  registerFileProtocol: (_scheme: string, _handler: any): void => {},
  registerHttpProtocol: (_scheme: string, _handler: any): void => {}
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