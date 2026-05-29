/**
 * Browser-only stub for Playwright E2E (replaces port/sidecar/adapters/tauri-shim.ts).
 */
const mockLeaf = {
  type: 'leaf',
  id: 'e2e-leaf',
  openFiles: [],
  activeFile: null
}

const mockConfig = {
  version: 'e2e-test',
  appLang: 'en-US',
  darkMode: false,
  alwaysReloadFiles: true,
  fileManagerMode: 'combined',
  fileManagerShowFiles: true,
  fileManagerShowWorkspaces: true,
  sortFoldersFirst: true,
  sorting: 'natural',
  display: {
    theme: 'berlin',
    renderingMode: 'preview',
    imageWidth: 100,
    imageHeight: 50
  },
  editor: { fontSize: 18, showStatusbar: true },
  window: {
    fileManagerVisible: true,
    sidebarVisible: false,
    nativeAppearance: false,
    vibrancy: false,
    currentSidebarTab: 'toc',
    recentGlobalSearches: []
  },
  ui: {
    fileManagerSplitSize: [20, 80],
    editorSidebarSplitSize: [80, 20]
  },
  displayToolbarButtons: {
    showOpenPreferencesButton: true,
    showNewFileButton: true,
    showPreviousFileButton: true,
    showNextFileButton: true,
    showPandocDivSpanButton: true,
    showMarkdownCommentButton: true,
    showMarkdownLinkButton: true,
    showMarkdownImageButton: true,
    showMarkdownMakeTaskListButton: true,
    showInsertTableButton: true,
    showInsertFootnoteButton: true,
    showDocumentInfoText: true,
    showPomodoroButton: true
  },
  app: { openFiles: [], openWorkspaces: [] },
  system: { zoomBehavior: 'gui', checkForUpdates: false }
}

const mockI18n = { translations: { '': {} } }

function configGet (property) {
  if (property === undefined) return mockConfig
  return property.split('.').reduce((obj, key) => obj?.[key], mockConfig)
}

async function providerInvoke (channel, message) {
  const command = message?.command
  const payload = message?.payload

  switch (channel) {
    case 'i18n':
      return mockI18n
    case 'css-provider':
      if (command === 'get-custom-css-path') return ''
      break
    case 'appearance-provider':
      if (command === 'get-accent-color') return { accent: '0072a3', contrast: 'ffffff' }
      break
    case 'assets-provider':
      if (command === 'list-snippets') return []
      break
    case 'documents-provider':
      if (command === 'retrieve-tab-config') return mockLeaf
      if (command === 'get-file-modification-status') return []
      break
    case 'config-provider':
      if (command === 'get-config') return mockConfig
      break
    case 'update-provider':
      if (command === 'update-status') return { updateAvailable: false }
      break
    case 'fsal':
      if (command === 'read-path-recursively') return []
      if (command === 'get-descriptor') return Array.isArray(payload) ? [] : null
      if (command === 'read-directory') return []
      break
    case 'lrt-provider':
      if (command === 'get-tasks') return []
      break
    case 'targets-provider':
      if (command === 'get-targets') return []
      break
    case 'tag-provider':
      if (command === 'get-colored-tags') return []
      if (command === 'get-all-tags') return []
      break
    case 'stats-provider':
      if (command === 'get-data') {
        return { wordCount: {}, charCount: {}, pomodoros: {} }
      }
      break
    default:
      break
  }

  return null
}

window.__LITTLR_SYNC_PORT__ = 0

window.ipc = {
  send: () => {},
  sendSync: (channel) => {
    if (channel === 'config-provider') return mockConfig
    if (channel === 'i18n') return mockI18n
    return null
  },
  invoke: providerInvoke,
  on: () => () => {}
}

window.config = {
  get: configGet,
  set: () => mockConfig
}

window.process = {
  platform: 'win32',
  version: '',
  versions: {},
  arch: 'x64',
  uptime: () => 0,
  getSystemVersion: () => '',
  env: {},
  argv: []
}

window.getPathForFile = () => undefined
window.getCitationCallback = () => () => undefined
