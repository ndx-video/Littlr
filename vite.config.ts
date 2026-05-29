import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { buildWebpackEntryDefines, isIconSvg, rendererWindows, viteAliases } from './vite.shared'

const repoRoot = path.dirname(fileURLToPath(import.meta.url))
const host = process.env.TAURI_DEV_HOST

const htmlInputs = Object.fromEntries(
  rendererWindows.map(({ name }) => [
    name,
    path.resolve(repoRoot, 'static/pages', `${name}.html`)
  ])
)

function iconSvgPlugin (): Plugin {
  return {
    name: 'icon-svg-source',
    transform (code, id) {
      if (isIconSvg(id)) {
        const content = fs.readFileSync(id, 'utf-8')
        return { code: `export default ${JSON.stringify(content)}`, map: null }
      }
    }
  }
}

export default defineConfig({
  root: repoRoot,
  clearScreen: false,
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag === 'cds-icon'
        }
      }
    }),
    iconSvgPlugin(),
    viteStaticCopy({
      targets: [
        { src: 'static/tutorial', dest: 'static' },
        { src: 'static/dict', dest: 'static' },
        { src: 'static/lang', dest: 'static' },
        { src: 'static/csl-locales', dest: 'static' },
        { src: 'static/csl-styles', dest: 'static' },
        { src: 'static/defaults', dest: 'static' },
        { src: 'static/lua-filter', dest: 'static' },
        { src: 'static/fonts', dest: 'static/fonts' }
      ]
    })
  ],
  define: {
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
    __GIT_COMMIT_HASH__: JSON.stringify(process.env.GIT_COMMIT_HASH ?? 'dev'),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __UPDATES_DISABLED__: JSON.stringify(process.env.ZETTLR_DISABLE_UPDATE_CHECK !== undefined ? '1' : '0'),
    ...buildWebpackEntryDefines()
  },
  resolve: {
    alias: [
      ...Object.entries(viteAliases).map(([find, replacement]) => ({ find, replacement })),
      { find: 'electron', replacement: path.resolve(repoRoot, 'e2e/stubs/electron.browser-stub.ts') },
      { find: /^~(.+)/, replacement: path.resolve(repoRoot, 'node_modules/$1') }
    ],
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.vue', '.json', '.less', '.css']
  },
  server: {
    port: 5173,
    strictPort: true,
    host: host ?? false,
    hmr: host ? { protocol: 'ws', host, port: 5174 } : undefined,
    watch: {
      ignored: ['**/src-tauri/target/**']
    }
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  css: {
    preprocessorOptions: {
      less: { javascriptEnabled: true }
    }
  },
  assetsInclude: ['**/*.wav', '**/*.mp3', '**/*.glsl'],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    rollupOptions: {
      input: htmlInputs
    }
  },
  optimizeDeps: {
    exclude: ['@cds/core']
  },
  worker: {
    format: 'es'
  }
})
