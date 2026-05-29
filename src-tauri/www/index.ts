import { invoke } from '@tauri-apps/api/core'

type ProviderResponse = {
  result?: unknown
  error?: { code: number; message: string }
}

async function rpc (
  channel: string,
  command: string,
  payload: Record<string, unknown> = {}
): Promise<ProviderResponse> {
  return invoke<ProviderResponse>('provider_call', { channel, command, payload })
}

function showResult (out: HTMLPreElement, label: string, resp: ProviderResponse): void {
  out.textContent = `${label}\n${JSON.stringify(resp.result ?? resp, null, 2)}`
}

function showError (out: HTMLPreElement, label: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  out.textContent = `${label}\nError: ${message}`
}

window.addEventListener('DOMContentLoaded', () => {
  const btnPing = document.getElementById('btn-ping') as HTMLButtonElement
  const btnLog = document.getElementById('btn-log') as HTMLButtonElement
  const btnConfig = document.getElementById('btn-config') as HTMLButtonElement
  const out = document.getElementById('output') as HTMLPreElement

  btnPing.onclick = async () => {
    try {
      const resp = await rpc('test-provider', 'ping', {})
      showResult(out, 'Ping response:', resp)
    } catch (err) {
      showError(out, 'Ping failed:', err)
    }
  }

  btnLog.onclick = async () => {
    try {
      const resp = await rpc('control-provider', 'log-info', { message: 'Sidecar test log entry' })
      showResult(out, 'Log response:', resp)
    } catch (err) {
      showError(out, 'Log failed:', err)
    }
  }

  btnConfig.onclick = async () => {
    try {
      const resp = await rpc('config-provider', 'get-config', {})
      showResult(out, 'Config payload:', resp)
    } catch (err) {
      showError(out, 'Config failed:', err)
    }
  }
})
