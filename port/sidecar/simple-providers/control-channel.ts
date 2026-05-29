/**
 * ControlChannel — lightweight control-plane commands for the Phase 0 spike.
 *
 * @license GNU GPL v3
 */
import fs from 'node:fs'
import path from 'node:path'

export default class ControlChannel {
  private logPath: string

  constructor () {
    this.logPath = path.resolve(process.env.ZETTLR_LOGS ?? './littlr.log', 'sidecar.log')
  }

  async logInfo (payload: { message: string }): Promise<{ result: string }> {
    const { message } = payload
    const timestamp = new Date().toISOString()
    const entry = `${timestamp} ${message}\n`
    await fs.promises.mkdir(path.dirname(this.logPath), { recursive: true })
    await fs.promises.appendFile(this.logPath, entry)
    return { result: `Logged: ${message}` }
  }

  async reload (): Promise<{ result: string }> {
    return { result: 'reloaded' }
  }

  async handle (_channel: string, command: string, payload: Record<string, unknown>): Promise<unknown> {
    switch (command) {
      case 'log-info':
        return this.logInfo(payload as { message: string })
      case 'reload':
        return this.reload()
      default:
        return { error: { code: -32601, message: `Unknown command: ${command}` } }
    }
  }
}
