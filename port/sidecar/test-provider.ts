/**
 * Sidecar Test Provider – a minimal stub that answers a single JSON-RPC command.
 *
 * Used for Phase 0.5 end‑to‑end verification:
 *   - Frontend calls `window.ipc.invoke('provider-call', {channel:'test-provider', command:'ping', payload:{}})`
 *   - This provider replies with `{result:'pong'}`.
 *
 * The provider is deliberately tiny – it only implements the `ping` command.
 * All other channels fall back to “unknown command”.
 *
 * @license GNU GPL v3
 */
export const testProvider = {
  _ipcChannel: 'test-provider',
  async handle(_channel: string, _command: string, _payload: any): Promise<any> {
    if (command === 'ping') {
      return { result: 'pong' };
    }
    return {
      error: {
        code: -32601,
        message: `Unknown command: ${command}`
      }
    };
  }
};