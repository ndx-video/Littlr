/**
 * No-op splash screen for Tauri sidecar boot (windows owned by Rust shell).
 *
 * @license GNU GPL v3
 */
import type LogProvider from '@providers/log'

export function showSplashScreen (_logger: LogProvider): void {}
export function updateSplashScreen (_message: string, _percent: number): void {}
export function closeSplashScreen (): void {}
