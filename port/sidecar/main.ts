/**
 * Zettlr Sidecar — Node.js backend during Tauri migration
 *
 * Boots the full AppServiceContainer and exposes providers via stdio JSON-RPC.
 *
 * @license GNU GPL v3
 */
import fs from 'node:fs'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { ipcMain } from './adapters/electron-shim'
import {
  AppServiceContainer,
  setAppServiceContainer
} from '../../source/app/app-service-container'

process.env.LITTLR_TAURI = '1'

// Sidecar uses stdout exclusively for JSON-RPC; route boot logs to stderr.
console.log = (...args: unknown[]) => { console.error(...args) }

;(globalThis as any).__GIT_COMMIT_HASH__ = process.env.GIT_COMMIT_HASH ?? 'dev'
;(globalThis as any).__BUILD_DATE__ = new Date().toISOString()
;(globalThis as any).__UPDATES_DISABLED__ = process.env.ZETTLR_DISABLE_UPDATE_CHECK !== undefined ? '1' : '0'

const rendererEntryPages: Array<[string, string]> = [
  ['MAIN_WINDOW', 'main'],
  ['PRINT', 'print'],
  ['LOG_VIEWER', 'log_viewer'],
  ['PREFERENCES', 'preferences'],
  ['TAG_MANAGER', 'tag_manager'],
  ['PASTE_IMAGE', 'paste_image'],
  ['ERROR', 'error'],
  ['ABOUT', 'about'],
  ['STATS', 'stats'],
  ['ASSETS', 'assets'],
  ['UPDATE', 'update'],
  ['PROJECT_PROPERTIES', 'project_properties'],
  ['SPLASH_SCREEN', 'splash_screen'],
  ['ONBOARDING', 'onboarding']
]

function installRendererEntryGlobals (): void {
  const pageBase = process.env.LITTLR_DEV_WEB_URL ?? 'http://localhost:5173'
  for (const [prefix, page] of rendererEntryPages) {
    ;(globalThis as any)[`${prefix}_WEBPACK_ENTRY`] = `${pageBase}/static/pages/${page}.html`
    ;(globalThis as any)[`${prefix}_PRELOAD_WEBPACK_ENTRY`] = 'undefined'
  }
}

const repoRoot = path.resolve(__dirname, '..', '..')

function ensureDirCopy (target: string, source: string): void {
  if (!fs.existsSync(target) && fs.existsSync(source)) {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.cpSync(source, target, { recursive: true })
  }
}

function bootstrapEnvironment (): void {
  const userData = process.env.ZETTLR_USER_DATA ?? path.join(repoRoot, '.zettlr-data')
  process.env.ZETTLR_USER_DATA = userData
  process.env.ZETTLR_RESOURCES = process.env.ZETTLR_RESOURCES ?? path.join(repoRoot, 'static')
  process.env.ZETTLR_LOGS = process.env.ZETTLR_LOGS ?? path.join(userData, 'logs')
  process.env.ZETTLR_CACHE = process.env.ZETTLR_CACHE ?? path.join(userData, 'cache')

  fs.mkdirSync(userData, { recursive: true })
  fs.mkdirSync(process.env.ZETTLR_LOGS, { recursive: true })

  fs.mkdirSync(path.join(userData, 'fsal', 'cache'), { recursive: true })

  const staticRoot = path.join(repoRoot, 'static')
  const assetDirs = ['lang', 'dict', 'defaults', 'csl-locales', 'csl-styles', 'lua-filter']
  for (const dir of assetDirs) {
    ensureDirCopy(path.join(userData, dir), path.join(staticRoot, dir))
    ensureDirCopy(path.join(repoRoot, 'source/common/util', dir), path.join(staticRoot, dir))
  }

  const assetsRoot = path.join(repoRoot, 'source/app/service-providers/assets/assets')
  ensureDirCopy(path.join(assetsRoot, 'defaults'), path.join(staticRoot, 'defaults'))
  ensureDirCopy(path.join(assetsRoot, 'lua-filter'), path.join(staticRoot, 'lua-filter'))
  ensureDirCopy(path.join(assetsRoot, 'csl-locales'), path.join(staticRoot, 'csl-locales'))
  ensureDirCopy(path.join(assetsRoot, 'csl-styles'), path.join(staticRoot, 'csl-styles'))

  const citeprocAssets = path.join(repoRoot, 'source/app/service-providers/citeproc/assets')
  ensureDirCopy(path.join(citeprocAssets, 'csl-locales'), path.join(staticRoot, 'csl-locales'))
  ensureDirCopy(path.join(citeprocAssets, 'csl-styles'), path.join(staticRoot, 'csl-styles'))
}

interface RPCRequest {
  jsonrpc: '2.0'
  id: number | string
  method: string
  params: Record<string, unknown>
}

interface RPCResponse {
  jsonrpc: '2.0'
  id: number | string
  result?: unknown
  error?: { code: number, message: string }
}

async function handleProviderCall (params: Record<string, unknown>): Promise<unknown> {
  const channel = String(params.channel ?? '')
  const command = String(params.command ?? '')
  const payload = (params.payload ?? {}) as Record<string, unknown>
  return ipcMain._dispatch(channel, { command, payload })
}

async function handleProviderSync (params: Record<string, unknown>): Promise<unknown> {
  const channel = String(params.channel ?? '')
  const message = params.message ?? {}
  return ipcMain._dispatchSync(channel, message)
}

async function handleRequest (req: RPCRequest): Promise<RPCResponse> {
  try {
    switch (req.method) {
      case 'provider-call':
        return {
          jsonrpc: '2.0',
          id: req.id,
          result: await handleProviderCall(req.params as Record<string, unknown>)
        }
      case 'provider-sync':
        return {
          jsonrpc: '2.0',
          id: req.id,
          result: await handleProviderSync(req.params as Record<string, unknown>)
        }
      default:
        return {
          jsonrpc: '2.0',
          id: req.id,
          error: { code: -32601, message: `Unknown method ${req.method}` }
        }
    }
  } catch (err: any) {
    return {
      jsonrpc: '2.0',
      id: req.id,
      error: { code: -32000, message: err.message ?? String(err) }
    }
  }
}

function startRPCLoop (): void {
  const rl = createInterface({ input: process.stdin })
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, result: 'ready' }) + '\n')

  rl.on('line', async (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return
    const req = JSON.parse(trimmed) as RPCRequest
    if (req.jsonrpc !== '2.0' || typeof req.method !== 'string') return
    const res = await handleRequest(req)
    process.stdout.write(JSON.stringify(res) + '\n')
  })
}

async function boot (): Promise<void> {
  bootstrapEnvironment()
  installRendererEntryGlobals()
  console.error('[sidecar] Booting AppServiceContainer (Tauri mode)...')
  const container = new AppServiceContainer()
  setAppServiceContainer(container)
  await container.boot()
  console.error('[sidecar] Boot complete')
  startRPCLoop()
}

boot().catch(err => {
  console.error('[sidecar] Fatal:', err)
  process.exit(1)
})
