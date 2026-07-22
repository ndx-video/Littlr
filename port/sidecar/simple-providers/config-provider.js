/**
 * Simple ConfigProvider for the sidecar – reads a JSON file from the
 * directory pointed to by ZETTLR_USER_DATA.
 *
 * This mirrors the shape of the real ConfigProvider but only implements
 * the `getConfig` method needed for Phase 0.5.
 *
 * @license GNU GPL v3
 */
const fs = require('fs');
const path = require('path');

export class SimpleConfigProvider {
  constructor() {
    // Resolve the config file location
    this.configPath = path.resolve(
      process.env.ZETTLR_USER_DATA ?? './littlr-data',
      'config.json'
    );
  }

  /** Load the JSON config file; return parsed object or empty object */
  async getConfig() {
    try {
      const fileContent = await fs.promises.readFile(this.configPath, 'utf-8');
      const parsed = JSON.parse(fileContent);
      return typeof parsed === 'object' ? parsed : {};
    } catch {
      // If file does not exist yet, return empty object
      return {};
    }
  }

  /** Save a new config object (useful for dev editing) */
  async setConfig(newConfig) {
    await fs.promises.writeFile(this.configPath, JSON.stringify(newConfig, null, 2));
  }

  /** Helper to expose the path for debugging */
  getPath() {
    return this.configPath;
  }
}