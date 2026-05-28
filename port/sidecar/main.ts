/**
 * Zettlr Sidecar — Node.js backend during Tauri migration
 *
 * Boots AppServiceContainer and exposes provider commands via stdio JSON-RPC.
 * Uses `port/sidecar/adapters/electron-shim.ts` to replace Electron APIs.
 *
 * Phase A (current): Full sidecar, Rust = shell only
 * Phase B (future):  Providers migrate to Rust one by one → sidecar shrinks
 *
 * Run: npx tsx --tsconfig port/sidecar/tsconfig.json port/sidecar/main.ts
 *
 * @license GNU GPL v3
 */
import { createInterface } from 'node:readline';
import { ipcMain } from './adapters/electron-shim';

// ---------------------------------------------------------------------------
// 1. Bootstrap — mirrors source/app/app-service-container.ts boot order
// ---------------------------------------------------------------------------

let isBooted = false;

async function boot(): Promise<void> {
  // -----------------------------------------------------------------------
  // Step 1: Boot LogProvider (always first — section 7, R1)
  // -----------------------------------------------------------------------
  console.error('[sidecar] Booting LogProvider...');
  const { default: LogProvider } = await import('@providers/log');
  const logProvider = new LogProvider();
  await logProvider.boot();

  // -----------------------------------------------------------------------
  // Step 2: Boot ConfigProvider
  // -----------------------------------------------------------------------
  console.error('[sidecar] Booting ConfigProvider...');
  const { default: ConfigProvider } = await import('@providers/config');
  const configProvider = new ConfigProvider();
  await configProvider.boot();

  // -----------------------------------------------------------------------
  // Step 3: Boot FSAL (stub — FSAL needs watchers, will be filled later)
  // -----------------------------------------------------------------------
  console.error('[sidecar] Booting FSAL (stub)...');
  const { createStubFSAL } = await import('./stub-fs');
  const fsal = createStubFSAL(logProvider, configProvider);

  // -----------------------------------------------------------------------
  // Step 4: Register providers for JSON-RPC routing
  // -----------------------------------------------------------------------
  const providers: Record<string, any> = {
    'log-provider': logProvider,
    'config-provider': configProvider,
    'fsal-provider': fsal,
    // ---------------------------------------------------------------
    // NEW: Simple control channel for dev commands (log-info, reload)
    // ---------------------------------------------------------------
    'control-provider': new (await import('./simple-providers/control-channel')).ControlChannel(),
  };

  // Register any providers that expose an ipc handler
  for (const [channel, provider] of Object.entries(providers)) {
    if (provider.hasOwnProperty('_registerIpc')) {
      ipcMain.handle(channel, (event, message) => provider.handle(event, message));
    }
    // Existing providers expose a `handle` method; we’ll call it directly
    // if it exists.
    if (typeof provider.handle === 'function') {
      ipcMain.handle(channel, (event, message) => provider.handle(channel, message));
    }
  }

  // Start the JSON‑RPC loop
  isBooted = true;
  console.error(`[sidecar] Boot complete — ${Object.keys(providers).length} providers registered`);
  startRPCLoop(providers);
}

// ---------------------------------------------------------------------------
// 2. Stub FSAL (placeholder until real FSAL is ported)
/**
 * The stub provides minimal read/write operations used by early phases.
 * It will be replaced when we port the real FSAL to Rust.
 */
function createStubFSAL(_log: any, _config: any) {
  return {
    _ipcChannel: 'fsal-provider',
    async readFile(_path: string): Promise<string> {
      return ''; // placeholder – real FSAL will be added later
    },
    async writeFile(_path: string, _content: string): Promise<void> {
      // no-op – future Rust implementation will handle it
    },
    // expose another command for sanity checks
    async testRead(): Promise<string> {
      return 'stub FSAL read OK';
    },
  };
}

// ---------------------------------------------------------------------------
// 3. JSON‑RPC over stdio
// ---------------------------------------------------------------------------

interface RPCRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params: {
    channel: string;
    command: string;
    payload?: unknown;
  };
}

interface RPCResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

async function handleRequest(
  req: RPCRequest,
  providers: Record<string, any>
): Promise<RPCResponse> {
  const { channel, command, payload } = req.params;

  // Grab the provider for this channel
  const provider = providers[channel];
  if (!provider) {
    return {
      jsonrpc: '2.0', id: req.id,
      error: { code: -32601, message: `Unknown provider: ${channel}` }
    };
  }

  // Forward to the provider’s handle method (if it exists)
  const handler = (provider as any).handle;
  if (typeof handler !== 'function') {
    return {
      jsonrpc: '2.0', id: req.id,
      error: { code: -32601, message: `Provider ${channel} has no handle method` }
    };
  }

  try {
    const result = await handler(channel, payload);
    return { jsonrpc: '2.0', id: req.id, result };
  } catch (err: any) {
    return {
      jsonrpc: '2.0', id: req.id,
      error: { code: -32000, message: err.message ?? String(err) }
    };
  }
}

function startRPCLoop(providers: Record<string, any>): void {
  const rl = createInterface({ input: process.stdin });

  // Signal readiness to Rust parent
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, result: 'ready' }) + '\n');

  rl.on('line', async (line: string) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;

    let req: RPCRequest;
    try {
      req = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (req.jsonrpc !== '2.0' || typeof req.method !== 'string') return;

    const res = await handleRequest(req, providers);
    process.stdout.write(JSON.stringify(res) + '\n');
  });
}

// ---------------------------------------------------------------------------
// 4. Entry point
// ---------------------------------------------------------------------------

boot().catch(err => {
  console.error('[sidecar] Fatal:', err);
  process.exit(1);
});