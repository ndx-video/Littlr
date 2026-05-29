/**
 * Simple ConfigProvider for the sidecar — reads a JSON file from the
 * directory pointed to by ZETTLR_USER_DATA.
 *
 * @license GNU GPL v3
 */
import fs from 'node:fs'
import path from 'node:path'

export default class ConfigProvider {
  private configPath: string

  constructor () {
    this.configPath = path.resolve(
      process.env.ZETTLR_USER_DATA ?? './littlr-data',
      'config.json'
    )
  }

  async boot (): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.configPath), { recursive: true })
  }

  async getConfig (): Promise<Record<string, unknown>> {
    try {
      const fileContent = await fs.promises.readFile(this.configPath, 'utf-8')
      const parsed = JSON.parse(fileContent)
      return typeof parsed === 'object' && parsed !== null ? parsed : {}
    } catch {
      return {}
    }
  }

  async setConfig (newConfig: Record<string, unknown>): Promise<void> {
    await fs.promises.writeFile(this.configPath, JSON.stringify(newConfig, null, 2))
  }

  getPath (): string {
    return this.configPath
  }

  async handle (_channel: string, command: string, payload: Record<string, unknown>): Promise<unknown> {
    switch (command) {
      case 'get-config':
        return { result: await this.getConfig() }
      case 'set-config':
        await this.setConfig(payload as Record<string, unknown>)
        return { result: 'saved' }
      default:
        return { error: { code: -32601, message: `Unknown command: ${command}` } }
    }
  }
}
