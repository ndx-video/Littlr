/**
 * Minimal LogProvider stub for Phase 0 sidecar boot order.
 *
 * @license GNU GPL v3
 */

export default class LogProvider {
  async boot (): Promise<void> {
    console.error('[sidecar] LogProvider ready')
  }

  async handle (_channel: string, command: string, payload: { message?: string }): Promise<unknown> {
    if (command === 'log-info') {
      console.error(`[log-provider] ${payload.message ?? ''}`)
      return { result: 'logged' }
    }
    return { error: { code: -32601, message: `Unknown command: ${command}` } }
  }
}
