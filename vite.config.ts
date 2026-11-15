/// <reference types="vitest/config" />
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crx } from '@crxjs/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import manifest from './manifest.config'

const root = fileURLToPath(new URL('.', import.meta.url))

function readPublicConfig(): unknown {
  const file = resolve(root, 'config/firebase.config.json')
  if (!existsSync(file)) return null
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { appCheck?: { debugToken?: string } }
  if (raw.appCheck?.debugToken) {
    console.warn(
      'Ignoring appCheck.debugToken in firebase.config.json. Use VITE_APPCHECK_DEBUG_TOKEN or the side panel so the token is not baked into source.',
    )
    delete raw.appCheck.debugToken
  }
  return raw
}

function previewRoot(): Plugin {
  return {
    name: 'formwhisper-preview-root',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/' || req.url === '/index.html') req.url = '/preview/index.html'
        next()
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const extension = mode === 'extension'
  return {
    plugins: [react(), extension ? crx({ manifest }) : previewRoot()],
    define: {
      __FORMWHISPER_CONFIG__: JSON.stringify(readPublicConfig()),
    },
    server: {
      host: '127.0.0.1',
      port: 43123,
      strictPort: true,
    },
    test: {
      environment: 'happy-dom',
      include: ['tests/**/*.test.ts'],
    },
  }
})
