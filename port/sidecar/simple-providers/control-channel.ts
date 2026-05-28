/**
 * ControlChannel — a lightweight bridge that lets the frontend
 * invoke simple control-plane commands (log-info, reload, etc.).
 * It lives inside the sidecar and forwards commands to
 * dedicated controller objects.
 *
 * All methods return a plain object that the JSON‑RPC
 * layer serialises back to the frontend.
 *
 * @license GNU GPL v3
 */
import * as fs from 'fs';
import * as path from 'path';

export class ControlChannel {
  private logPath: string;

  constructor() {
    // Resolve log path from the env var, fallback to ./littlr.log
    this.logPath = path.resolve(process.env.ZETTLR_LOGS ?? './littlr.log');
  }

  /** Append a message to the log file */
  async logInfo(payload: { message: string }): Promise<{ result: string }> {
    const { message } = payload;
    const timestamp = new Date().toISOString();
    const entry = `${timestamp} ${message}\n`;
    await fs.promises.appendFile(this.logPath, entry);
    return { result: `Logged: ${message}` };
  }

  /** Reload the sidecar (useful for dev) */
  async reload(): Promise<{ result: string }> {
    // In a real app we would restart the process; for now just return OK.
    return { result: 'reloaded' };
  }
}