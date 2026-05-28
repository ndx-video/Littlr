/**
 * Zettlr Sidecar — Node.js backend during Tauri migration
 *
 * Boots AppServiceContainer and exposes provider commands via stdio JSON-RPC.
 * This preserves all existing provider logic while Tauri handles the shell.
 *
 * Phase A (current): Full sidecar, Rust = shell only
 * Phase B (future):  Providers migrate to Rust one by one → sidecar shrinks
 *
 * @license GNU GPL v3
 */

import { createInterface } from 'node:readline'

// ---------------------------------------------------------------------------
// 1. Bootstrap — mirrors source/main.ts boot order
// ---------------------------------------------------------------------------

// TODO Phase 0.5: Import and boot providers
// - LogProvider → logging (always first)
// - CSSProvider → create custom CSS file early
// - ConfigProvider → load user config
// - FSAL → file system abstraction layer
// - Remaining providers in dependency order

// For now, stub the container
const providers: Record<string, any> = {}
let isBooted = false

async function boot(): Promise<void> {
  console.error('[sidecar] Boot starting...')

  // TODO: Instantiate and boot providers per app-service-container.ts order
  // Log → CSS → Config → FSAL → DocumentManager → Tags → Window → etc.

  isBooted = true
  console.error('[sidecar] Boot complete')
}

// ---------------------------------------------------------------------------
// 2. JSON-RPC over stdio
// ---------------------------------------------------------------------------

interface RPCRequest {
  jsonrpc: '2.0'
  id: number | string
  method: string // e.g. 'provider-call'
  params: {
    channel: string    // e.g. 'config-provider'
    command: string    // e.g. 'get-config'
    payload?: unknown  // command payload
  }
}

interface RPCResponse {
  jsonrpc: '2.0'
  id: number | string
  result?: unknown
  error?: { code: number; message: string }
}

async function handleRequest(req: RPCRequest): Promise<RPCResponse> {
  const { channel, command, payload } = req.params

  // Route to the appropriate provider
  const provider = providers[channel]
  if (provider === undefined) {
    return {
      jsonrpc: '2.0', id: req.id,
      error: { code: -32601, message: `Unknown provider: ${channel}` }
    }
  }

  try {
    const result = await provider.handle(command, payload)
    return { jsonrpc: '2.0', id: req.id, result }
  } catch (err: any) {
    return {
      jsonrpc: '2.0', id: req.id,
      error: { code: -32000, message: err.message ?? String(err) }
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Main — read JSON-RPC lines from stdin, write responses to stdout
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await boot()

  const rl = createInterface({ input: process.stdin })

  for await (const line of rl) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue

    let req: RPCRequest
    try {
      req = JSON.parse(trimmed)
    } catch {
      // Non-JSON line; skip
      continue
    }

    if (req.jsonrpc !== '2.0' || typeof req.method !== 'string') continue

    const res = await handleRequest(req)
    process.stdout.write(JSON.stringify(res) + '\n')
  }
}

main().catch(err => {
  console.error('[sidecar] Fatal:', err)
  process.exit(1)
})