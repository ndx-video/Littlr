import fs from 'node:fs'
import path from 'node:path'

const rendererWindows = [
  { name: 'main', folder: 'win-main', title: 'Littlr' },
  { name: 'print', folder: 'win-print', title: 'Print' },
  { name: 'log_viewer', folder: 'win-log-viewer', title: 'Log Viewer' },
  { name: 'preferences', folder: 'win-preferences', title: 'Preferences' },
  { name: 'tag_manager', folder: 'win-tag-manager', title: 'Tag Manager' },
  { name: 'paste_image', folder: 'win-paste-image', title: 'Paste Image' },
  { name: 'error', folder: 'win-error', title: 'Error' },
  { name: 'about', folder: 'win-about', title: 'About' },
  { name: 'stats', folder: 'win-stats', title: 'Statistics' },
  { name: 'assets', folder: 'win-assets', title: 'Assets' },
  { name: 'update', folder: 'win-update', title: 'Update' },
  { name: 'project_properties', folder: 'win-project-properties', title: 'Project Properties' },
  { name: 'splash_screen', folder: 'win-splash-screen', title: 'Littlr' },
  { name: 'onboarding', folder: 'win-onboarding', title: 'Welcome' }
]

const dir = path.join('static', 'pages')
fs.mkdirSync(dir, { recursive: true })

for (const { name, folder, title } of rendererWindows) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline' http://127.0.0.1:* http://localhost:*">
  <title>${title}</title>
</head>
<body>
  <div id="app" role="application"></div>
  <script type="module" src="/port/sidecar/adapters/tauri-shim.ts"></script>
  <script type="module" src="/source/${folder}/index.ts"></script>
</body>
</html>
`
  fs.writeFileSync(path.join(dir, `${name}.html`), html)
}

console.log(`Generated ${rendererWindows.length} renderer pages in ${dir}`)
