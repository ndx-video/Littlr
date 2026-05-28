/**
 * Tauri compatibility shim — replaces Electron preload APIs.
 *
 * Load this instead of `source/common/modules/preload/index.ts` during
 * Phase A. It exposes the same `window.ipc` / `window.config` / etc.
 * surface using Tauri's `invoke` and `listen` instead of `ipcRenderer`.
 *
 * Phase 1.3.5: Drop-in replacement for renderer compatibility.
 *
 * @license GNU GPL v3
 */

// NOTE: This file will use @tauri-apps/api in production.
// During Phase 0 spike, it can use a mock/bridge for testing.
// In Electron (today), the preload at source/common/modules/preload/index.ts
// is still used. This file is prepared for the Tauri migration.

// ---------------------------------------------------------------------------
// window.ipc — matches Electron preload API
// ---------------------------------------------------------------------------

// Pseudocode for Phase 1:
//
// import { invoke } from '@tauri-apps/api/core'
// import { listen, emit } from '@tauri-apps/api/event'
//
// window.ipc = {
//   send: (channel: string, ...args: any[]) => {
//     invoke('provider_send', { channel, args })
//   },
//   sendSync: (channel: string, ...args: any[]) => {
//     // Tauri invoke is async-only; sendSync must be refactored out
//     // See Phase 3.2: Replace sendSync hot paths with async invoke
//     throw new Error('sendSync not available in Tauri — use invoke instead')
//   },
//   invoke: async (channel: string, ...args: any[]) => {
//     return invoke('provider_invoke', { channel, args })
//   },
//   on: (channel: string, listener: (...args: any[]) => void) => {
//     const unlisten = listen(channel, (event) => {
//       listener(undefined, ...(event.payload as any[]))
//     })
//     return () => { unlisten.then(fn => fn()) }
//   }
// }
//
// window.config = {
//   get: (property?: string) => {
//     // Will use invoke('provider_send_sync', ...) or a Rust-side config cache
//   },
//   set: (property: string, value: any) => {
//     // Will use invoke('provider_send', ...)
//   }
// }
//
// window.getCitationCallback = function(database: string) {
//   // Critical hot path — needs special handling due to sendSync removal
// }
//
// window.process = { platform, version, versions, arch, env, argv }
//
// window.getPathForFile = (file: File): string|undefined => {
//   // Tauri provides drag-drop paths natively; this may not be needed
// }