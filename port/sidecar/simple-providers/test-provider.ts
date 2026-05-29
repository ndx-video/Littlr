/**
 * Sidecar Test Provider — answers `ping` for Phase 0 end-to-end checks.
 *
 * @license GNU GPL v3
 */

export default class TestProvider {
  async handle (_channel: string, command: string, _payload: unknown): Promise<unknown> {
    if (command === 'ping') {
      return { result: 'pong' }
    }
    return { error: { code: -32601, message: `Unknown command: ${command}` } }
  }
}
