/**
 * Zettlr Sidecar — Node.js backend during Tauri migration
 *
 * Boots remapped providers and exposes them via stdio JSON-RPC.
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
// 1. Bootstrap — order mirrors source/app-service-container.ts
// ---------------------------------------------------------------------------

let isBooted = false;

async function boot(): Promise<void> {
  // -----------------------------------------------------------------------
  // Step 1: LogProvider (always first — section 7, R1)
  // -----------------------------------------------------------------------
  console.error('[sidecar] Booting LogProvider...');
  const { default: LogProvider } = await import('./simple-providers/log-provider');
  const logProvider = new LogProvider();
  await logProvider.boot();

  // -----------------------------------------------------------------------
  // Step 2: ConfigProvider
  // -----------------------------------------------------------------------
  console.error('[sidecar] Booting ConfigProvider...');
  const { default: ConfigProvider } = await import('./simple-providers/config-provider');
  const configProvider = new ConfigProvider();
  await configProvider.boot();

  // -----------------------------------------------------------------------
  // Step 3: FSAL (stub) – minimal read/write for Phase 0.5
  // -----------------------------------------------------------------------
  console.error('[sidecar] Booting FSAL (stub)...');
  const { createStubFSAL } = await import('./stub-fs');
  const fsal = createStubFSAL(logProvider, configProvider);

  // -----------------------------------------------------------------------
  // Step 4: Register all providers for JSON‑RPC routing
  // -----------------------------------------------------------------------
  const providers: Record<string, any> = {
    'log-provider': logProvider,
    'config-provider': configProvider,
    'fsal-provider': fsal,
    'test-provider': new (await import('./simple-providers/test-provider')).TestProvider(),
    'control-provider': new (await import('./simple-providers/control-channel')).ControlChannel(),
  };

  // Wire each provider to the JSON‑RPC dispatcher
  for (const [channel, prov] of Object.entries(providers)) {
    const handler = (prov as any).handle;
    if (typeof handler === 'function') {
      ipcMain.handle(channel, (event, message) => handler(channel, message));
    }
  }

  isBooted = true;
  console.error(`[sidecar] Boot complete – ${Object.keys(providers).length} providers ready`);
  startRPCLoop(providers);
}

// ---------------------------------------------------------------------------
// 2. Stub FSAL (placeholder until real FSAL migrates to Rust)
// ---------------------------------------------------------------------------
function createStubFSAL(_log: any, _config: any) {
  return {
    _ipcChannel: 'fsal-provider',
    async readFile(_path: string): Promise<string> {
      return '';
    },
    async writeFile(_path: string, _content: string): Promise<void> {
      // no‑op for now
    },
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

async function handleRequest(req: RPCRequest, providers: Record<string, any>): Promise<RPCResponse> {
  const { channel, command, payload } = req.params;
  const provider = providers[channel];
  if (!provider) {
    return { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `Unknown provider ${channel}` } };
  }
  const handler = (provider as any).handle;
  if (typeof handler !== 'function') {
    return { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `Provider ${channel} missing handle` } };
  }
  try {
    const result = await handler(channel, payload);
    return { jsonrpc: '2.0', id: req.id, result };
  } catch (err: any) {
    return { jsonrpc: '2.0', id: req.id, error: { code: -32000, message: err.message ?? String(err) } };
  }
}

function startRPCLoop(providers: Record<string, any>): void {
  const rl = createInterface({ input: process.stdin });
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, result: 'ready' }) + '\n');

  rl.on('line', async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const req: RPCRequest = JSON.parse(trimmed);
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
