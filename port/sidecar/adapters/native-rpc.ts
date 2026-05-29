/**
 * Sidecar → Rust native RPC over localhost HTTP (synchronous).
 *
 * @license GNU GPL v3
 */
import { spawnSync } from 'node:child_process'

function nativePort (): number {
  const raw = process.env.LITTLR_NATIVE_RPC_PORT
  if (raw === undefined || raw === '') {
    throw new Error('LITTLR_NATIVE_RPC_PORT is not set')
  }
  return Number.parseInt(raw, 10)
}

export function nativeRpcSync (method: string, params: Record<string, unknown> = {}): unknown {
  const port = nativePort()
  const body = JSON.stringify({ method, params })
  const script = `
const http = require('http');
const payload = ${JSON.stringify(body)};
const req = http.request({
  hostname: '127.0.0.1',
  port: ${port},
  path: '/rpc/native',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
}, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    process.stdout.write(JSON.stringify({ status: res.statusCode, body: data }));
  });
});
req.on('error', (err) => {
  process.stdout.write(JSON.stringify({ status: 500, error: String(err) }));
});
req.write(payload);
req.end();
`

  const result = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    timeout: 120_000,
    windowsHide: true
  })

  if (result.error !== undefined) {
    throw result.error
  }

  const stdout = result.stdout.trim()
  if (stdout === '') {
    throw new Error('Native RPC returned empty response')
  }

  const envelope = JSON.parse(stdout) as { status?: number, body?: string, error?: string }
  if (envelope.error !== undefined) {
    throw new Error(envelope.error)
  }
  if ((envelope.status ?? 500) < 200 || (envelope.status ?? 500) >= 300) {
    throw new Error(`Native RPC failed (${envelope.status}): ${envelope.body ?? ''}`)
  }

  const parsed = JSON.parse(envelope.body ?? '{}') as { result?: unknown, error?: string }
  if (parsed.error !== undefined) {
    throw new Error(parsed.error)
  }
  return parsed.result
}
