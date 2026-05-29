/**
 * Tauri compatibility shim — replaces Electron preload APIs in WebView renderers.
 *
 * @license GNU GPL v3
 */
import { invoke } from '@tauri-apps/api/core'
import { listen, emit } from '@tauri-apps/api/event'

declare global {
  interface Window {
    __LITTLR_SYNC_PORT__?: number
  }
}

function resolveSyncPort (): number {
  if (window.__LITTLR_SYNC_PORT__ !== undefined) {
    return window.__LITTLR_SYNC_PORT__
  }
  const fromUrl = new URLSearchParams(window.location.search).get('__littlr_sync_port')
  if (fromUrl !== null) {
    const port = Number.parseInt(fromUrl, 10)
    if (!Number.isNaN(port)) {
      window.__LITTLR_SYNC_PORT__ = port
      return port
    }
  }
  throw new Error('Littlr sync bridge not initialized (__LITTLR_SYNC_PORT__)')
}

const syncPort = (): number => resolveSyncPort()

function normalizeMessage (args: unknown[]): Record<string, unknown> | undefined {
  if (args.length === 0) {
    return undefined
  }
  const first = args[0]
  if (first !== null && typeof first === 'object') {
    return first as Record<string, unknown>
  }
  return { payload: first }
}

async function providerInvoke (channel: string, message?: Record<string, unknown>): Promise<unknown> {
  return invoke('provider_invoke', { channel, message: message ?? null })
}

function providerSendSync (channel: string, message?: Record<string, unknown>): unknown {
  const xhr = new XMLHttpRequest()
  xhr.open('POST', `http://127.0.0.1:${syncPort()}/rpc/sync`, false)
  xhr.setRequestHeader('Content-Type', 'application/json')
  xhr.send(JSON.stringify({ channel, message: message ?? null }))
  if (xhr.status < 200 || xhr.status >= 300) {
    throw new Error(`Sidecar sync RPC failed (${xhr.status}): ${xhr.responseText}`)
  }
  const parsed = JSON.parse(xhr.responseText) as { result?: unknown, error?: string }
  if (parsed.error !== undefined) {
    throw new Error(parsed.error)
  }
  return parsed.result
}

const channelListeners = new Map<string, Set<(event: undefined, ...args: unknown[]) => void>>()

window.ipc = {
  send: (channel: string, ...args: unknown[]) => {
    void providerInvoke(channel, normalizeMessage(args))
  },
  sendSync: (channel: string, ...args: unknown[]) => {
    return providerSendSync(channel, normalizeMessage(args))
  },
  invoke: async (channel: string, ...args: unknown[]) => {
    if (args.length === 0) {
      return providerInvoke(channel)
    }
    const first = args[0]
    if (first !== null && typeof first === 'object' && ('command' in first || 'payload' in first)) {
      return providerInvoke(channel, first as Record<string, unknown>)
    }
    return providerInvoke(channel, normalizeMessage(args))
  },
  on: (channel: string, listener: (event: undefined, ...args: unknown[]) => void) => {
    let set = channelListeners.get(channel)
    if (set === undefined) {
      set = new Set()
      channelListeners.set(channel, set)
    }
    set.add(listener)

    void listen<unknown[]>(`littlr://${channel}`, (event) => {
      const payload = event.payload
      if (Array.isArray(payload)) {
        listener(undefined, ...payload)
      } else {
        listener(undefined, payload)
      }
    })

    return () => {
      set?.delete(listener)
    }
  }
}

window.config = {
  get: (property?: string) => {
    return providerSendSync('config-provider', {
      command: 'get-config',
      payload: property !== undefined ? { key: property } : undefined
    })
  },
  set: (property: string, value: unknown) => {
    return providerSendSync('config-provider', {
      command: 'set-config-single',
      payload: { key: property, val: value }
    })
  }
}

window.getCitationCallback = (database: string) => {
  return (citations: CiteItem[], composite: boolean): string | undefined => {
    return providerSendSync('citeproc-provider', {
      command: 'get-citation-sync',
      payload: { database, citations, composite }
    }) as string | undefined
  }
}

window.process = {
  platform: 'win32',
  version: '',
  versions: {},
  arch: 'x64',
  uptime: () => 0,
  getSystemVersion: () => '',
  env: {},
  argv: []
}

window.getPathForFile = (_file: File): string | undefined => {
  return undefined
}

function formatConsoleArgs (args: unknown[]): string {
  return args.map((arg) => {
    if (typeof arg === 'string') return arg
    try {
      return JSON.stringify(arg)
    } catch {
      return String(arg)
    }
  }).join(' ')
}

function installRendererConsoleBridge (): void {
  const windowId = new URLSearchParams(window.location.search).get('window_id') ?? 'unknown'

  const forward = (
    level: 'debug' | 'info' | 'warning' | 'error',
    original: (...args: unknown[]) => void
  ) => (...args: unknown[]): void => {
    original(...args)
    try {
      window.ipc.send('log-provider', {
        command: 'renderer-console',
        payload: {
          level,
          message: formatConsoleArgs(args),
          sourceId: window.location.pathname,
          lineNumber: 0,
          windowId
        }
      })
    } catch {
      // Sync bridge may not be ready during very early boot.
    }
  }

  console.debug = forward('debug', console.debug.bind(console))
  console.log = forward('info', console.log.bind(console))
  console.info = forward('info', console.info.bind(console))
  console.warn = forward('warning', console.warn.bind(console))
  console.error = forward('error', console.error.bind(console))
}

installRendererConsoleBridge()

/** Allow Rust/other windows to broadcast IPC events to listeners */
export async function littlrEmit (channel: string, payload: unknown): Promise<void> {
  await emit(`littlr://${channel}`, payload)
}

export { providerInvoke, providerSendSync }
