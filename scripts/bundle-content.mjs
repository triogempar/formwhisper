import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['src/content/index.ts'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  outfile: 'dist/content.js',
  legalComments: 'none',
})

const { readFileSync } = await import('node:fs')
const source = readFileSync('dist/content.js', 'utf8')
if (source.includes('import(') || source.includes('chrome.runtime.getURL')) {
  throw new Error('content.js must be a single IIFE with no dynamic import loader')
}
console.log('Wrote dist/content.js')
