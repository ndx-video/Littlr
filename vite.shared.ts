import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('.', import.meta.url))

/** Renderer windows — mirrors forge.config.js generateRendererEntrypoint list */
export const rendererWindows = [
  { name: 'main', folder: 'win-main', title: 'Littlr', webpackPrefix: 'MAIN_WINDOW' },
  { name: 'print', folder: 'win-print', title: 'Print', webpackPrefix: 'PRINT' },
  { name: 'log_viewer', folder: 'win-log-viewer', title: 'Log Viewer', webpackPrefix: 'LOG_VIEWER' },
  { name: 'preferences', folder: 'win-preferences', title: 'Preferences', webpackPrefix: 'PREFERENCES' },
  { name: 'tag_manager', folder: 'win-tag-manager', title: 'Tag Manager', webpackPrefix: 'TAG_MANAGER' },
  { name: 'paste_image', folder: 'win-paste-image', title: 'Paste Image', webpackPrefix: 'PASTE_IMAGE' },
  { name: 'error', folder: 'win-error', title: 'Error', webpackPrefix: 'ERROR' },
  { name: 'about', folder: 'win-about', title: 'About', webpackPrefix: 'ABOUT' },
  { name: 'stats', folder: 'win-stats', title: 'Statistics', webpackPrefix: 'STATS' },
  { name: 'assets', folder: 'win-assets', title: 'Assets', webpackPrefix: 'ASSETS' },
  { name: 'update', folder: 'win-update', title: 'Update', webpackPrefix: 'UPDATE' },
  { name: 'project_properties', folder: 'win-project-properties', title: 'Project Properties', webpackPrefix: 'PROJECT_PROPERTIES' },
  { name: 'splash_screen', folder: 'win-splash-screen', title: 'Littlr', webpackPrefix: 'SPLASH_SCREEN' },
  { name: 'onboarding', folder: 'win-onboarding', title: 'Welcome', webpackPrefix: 'ONBOARDING' }
] as const

export function buildWebpackEntryDefines (): Record<string, string> {
  const pageBase = process.env.TAURI_ENV_PLATFORM !== undefined && process.env.TAURI_ENV_DEBUG !== 'true'
    ? 'tauri://localhost'
    : 'http://localhost:5173'
  const defines: Record<string, string> = {}
  for (const { name, webpackPrefix } of rendererWindows) {
    defines[`${webpackPrefix}_WEBPACK_ENTRY`] = JSON.stringify(`${pageBase}/static/pages/${name}.html`)
    defines[`${webpackPrefix}_PRELOAD_WEBPACK_ENTRY`] = JSON.stringify('undefined')
  }
  return defines
}

export const viteAliases = {
  source: path.resolve(repoRoot, 'source'),
  '@common': path.resolve(repoRoot, 'source/common'),
  '@providers': path.resolve(repoRoot, 'source/app/service-providers'),
  '@dts': path.resolve(repoRoot, 'source/types')
}

export const svgIconFolders = [
  path.resolve(repoRoot, 'source/common/modules/window-register/icons'),
  path.resolve(repoRoot, 'source/common/modules/markdown-editor/table-editor/icons')
]

export function isIconSvg (id: string): boolean {
  return id.endsWith('.svg') && svgIconFolders.some(folder => id.startsWith(folder))
}
