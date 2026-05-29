/**
 * Sidecar boot + JSON-RPC smoke test (stdio).
 * Used locally and in CI (see .github/workflows/tauri-spike.yml).
 */
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tsconfig = path.join(repoRoot, 'port', 'sidecar', 'tsconfig.json')
const sidecarMain = path.join(repoRoot, 'port', 'sidecar', 'main.ts')
const userData = path.join(repoRoot, '.zettlr-data-smoke')

const BOOT_TIMEOUT_MS = 120_000
const RPC_TIMEOUT_MS = 30_000

function fail (message) {
  console.error(`[sidecar-smoke] FAIL: ${message}`)
  process.exit(1)
}

const child = spawn(
  'npx',
  ['tsx', '--tsconfig', tsconfig, sidecarMain],
  {
    cwd: repoRoot,
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      LITTLR_TAURI: '1',
      ZETTLR_USER_DATA: userData,
      ZETTLR_DISABLE_UPDATE_CHECK: '1'
    },
    stdio: ['pipe', 'pipe', 'inherit']
  }
)

let bootTimer = setTimeout(() => fail('sidecar did not become ready in time'), BOOT_TIMEOUT_MS)
let rpcTimer
let rpcSent = false

const rl = createInterface({ input: child.stdout })

rl.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) return

  if (!rpcSent && trimmed.includes('"result":"ready"')) {
    clearTimeout(bootTimer)
    rpcSent = true
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'provider-sync',
      params: {
        channel: 'config-provider',
        message: { command: 'get-config' }
      }
    }
    child.stdin.write(`${JSON.stringify(request)}\n`)
    rpcTimer = setTimeout(() => fail('sidecar did not respond to config RPC'), RPC_TIMEOUT_MS)
    return
  }

  if (!rpcSent) return

  let parsed
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return
  }

  if (parsed.error !== undefined) {
    fail(`RPC error: ${JSON.stringify(parsed.error)}`)
  }

  const config = parsed.result?.result ?? parsed.result
  if (config?.version === undefined) {
    fail(`unexpected config payload: ${trimmed.slice(0, 200)}`)
  }

  clearTimeout(rpcTimer)
  console.log(`[sidecar-smoke] OK: config version=${config.version}`)
  child.kill()
  process.exit(0)
})

child.on('exit', (code, signal) => {
  if (code === 0 || signal === 'SIGTERM') return
  fail(`sidecar exited early (code=${code}, signal=${signal})`)
})
