/**
 * Vite/browser stub for `electron` imports when running the renderer without Electron.
 * Used by Playwright E2E and `yarn dev:web` (Tauri renderers use tauri-shim instead).
 */
const noop = (): void => {}
const noopAsync = async (): Promise<void> => {}

export const app = {
  getPath: () => '',
  getVersion: () => '0.0.0-browser',
  getLocale: () => 'en-US',
  isPackaged: false,
  on: noop,
  whenReady: async (): Promise<void> => {},
  quit: noop,
  requestSingleInstanceLock: () => true,
  setAppUserModelId: noop,
  commandLine: { appendSwitch: noop }
}

export const ipcMain = {
  handle: noop,
  on: noop,
  removeHandler: noop
}

export const ipcRenderer = {
  send: noop,
  invoke: async (): Promise<unknown> => null,
  on: noop,
  sendSync: (): unknown => null
}

export const dialog = {
  showMessageBox: async (): Promise<{ response: number }> => ({ response: 0 }),
  showOpenDialog: async (): Promise<{ filePaths: string[], canceled: boolean }> => ({ filePaths: [], canceled: true }),
  showSaveDialog: async (): Promise<{ filePath?: string, canceled: boolean }> => ({ canceled: true })
}

export class BrowserWindow {
  static getAllWindows (): BrowserWindow[] { return [] }
  static getFocusedWindow (): BrowserWindow | null { return null }
  webContents = { send: noop, on: noop, session: { clearStorageData: noopAsync } }
  on = noop
  once = noop
  loadURL = noopAsync
  show = noop
  close = noop
}

export const shell = {
  openExternal: noopAsync,
  openPath: async (): Promise<string> => '',
  showItemInFolder: noop
}

export const clipboard = {
  readText: (): string => '',
  writeText: noop
}

export const nativeTheme = {
  themeSource: 'system',
  shouldUseDarkColors: false,
  on: noop
}

export const systemPreferences = {
  getAccentColor: (): string => '#000000',
  getColor: (): string => '#000000'
}

export const Notification = class {
  static isSupported (): boolean { return false }
}

export const nativeImage = {
  createFromBuffer: (): unknown => ({})
}

export const protocol = {
  registerFileProtocol: noop,
  registerSchemesAsPrivileged: noop
}

export const net = {
  request: (): unknown => ({})
}

export const contextBridge = {
  exposeInMainWorld: noop
}

export const webUtils = {}

export type FileFilter = { name: string, extensions: string[] }
export type BrowserWindowConstructorOptions = Record<string, unknown>
export type MessageBoxOptions = Record<string, unknown>
export type MessageBoxReturnValue = { response: number }
export type OpenDialogOptions = Record<string, unknown>
export type OpenDialogReturnValue = { filePaths: string[], canceled: boolean }
