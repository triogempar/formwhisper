import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const dist = path.resolve('dist')
const configPath = path.resolve('config/firebase.config.json')

function build() {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'build'], { stdio: 'inherit' })
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build exited ${code}`))))
  })
}

function serve() {
  const pages = {
    '/form': `<!doctype html><title>Fixture form</title>
      <form><label>First Name <input name="02firstname"></label></form>
      <iframe src="/empty" title="embed"></iframe>`,
    '/empty': `<!doctype html><title>No fields</title><article><p>A video page with no form.</p></article>`,
  }
  const server = createServer((req, res) => {
    const body = pages[req.url] || pages['/empty']
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(body)
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve({ server, origin: `http://127.0.0.1:${address.port}` })
    })
  })
}

const config = {
  firebase: {
    apiKey: 'local-test-api-key',
    authDomain: 'formwhisper-debug.firebaseapp.com',
    projectId: 'formwhisper-debug',
    storageBucket: 'formwhisper-debug.firebasestorage.app',
    messagingSenderId: '1234567890',
    appId: '1:1234567890:web:abcdef123456',
  },
  appCheck: { mode: 'debug', recaptchaEnterpriseSiteKey: '' },
  cloudModel: 'gemini-4-hydrogen',
}

writeFileSync(configPath, JSON.stringify(config, null, 2))
let userData
let browser
let http
try {
  await build()
  const content = readFileSync(path.join(dist, 'content.js'), 'utf8')
  if (/\bimport\s*\(/.test(content) || content.includes('chrome.runtime.getURL')) {
    throw new Error('content.js still has a dynamic import loader')
  }
  const manifest = JSON.parse(readFileSync(path.join(dist, 'manifest.json'), 'utf8'))
  if (manifest.content_scripts) throw new Error('manifest still registers a content script loader')
  if (manifest.web_accessible_resources) throw new Error('manifest still publishes web-accessible chunks')
  const workerSource = readFileSync(path.join(dist, 'service-worker-loader.js'), 'utf8')
  if (/recaptcha/i.test(workerSource)) throw new Error('service worker references recaptcha')
  const debugFile = readdirSync(path.join(dist, 'assets')).find((name) => name.startsWith('app-check-debug-'))
  if (!debugFile) throw new Error('debug App Check chunk missing')
  const debugSource = readFileSync(path.join(dist, 'assets', debugFile), 'utf8')
  if (/recaptcha/i.test(debugSource)) throw new Error('debug App Check chunk references recaptcha')

  http = await serve()
  userData = mkdtempSync(path.join(tmpdir(), 'fw-ext-'))
  function chromeForTestingPath() {
    const root = path.join(homedir(), '.cache/ms-playwright')
    if (!existsSync(root)) return ''
    for (const entry of readdirSync(root)) {
      const candidate = path.join(root, entry, 'chrome-linux64', 'chrome')
      if (existsSync(candidate)) return candidate
    }
    return ''
  }
  const chromeForTesting = chromeForTestingPath()
  // Branded Chrome 137+ ignores --load-extension. Chrome for Testing still honors it and enforces MV3 CSP.
  const executablePath = process.env.CHROME_PATH || chromeForTesting || '/usr/bin/google-chrome'
  browser = await chromium.launchPersistentContext(userData, {
    headless: true,
    executablePath,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  })

  const recaptcha = []
  browser.on('request', (request) => {
    const url = request.url()
    if (url.includes('google.com/recaptcha') || url.includes('gstatic.com/recaptcha') || url.includes('enterprise.js')) {
      recaptcha.push(url)
    }
  })
  const problems = []
  function watch(page, label) {
    page.on('pageerror', (error) => problems.push(`${label} pageerror: ${error.message}`))
    page.on('console', (msg) => {
      const text = msg.text()
      if (/unsafe attempt to load url chrome-extension:|domains, protocols and ports must match|recaptcha\/enterprise\.js|google\.com\/recaptcha/i.test(text)) {
        problems.push(`${label} console: ${text}`)
      }
    })
  }

  let worker = browser.serviceWorkers()[0]
  if (!worker) worker = await browser.waitForEvent('serviceworker', { timeout: 20000 })
  const extensionId = new URL(worker.url()).host
  const logs = []
  const panel = await browser.newPage()
  watch(panel, 'panel')
  panel.on('console', (msg) => logs.push(msg.text()))
  await panel.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`, { waitUntil: 'domcontentloaded' })
  await panel.waitForFunction(
    () => document.body && document.body.innerText.includes('Formwhisper'),
    null,
    { timeout: 10000 },
  )
  const deadline = Date.now() + 8000
  while (Date.now() < deadline && !logs.some((line) => line.includes('AppCheck debug token'))) {
    await panel.waitForTimeout(200)
  }
  if (!logs.some((line) => line.includes('AppCheck debug token'))) {
    throw new Error(`Missing AppCheck debug token log. Console:\n${logs.join('\n')}`)
  }
  await panel.waitForTimeout(400)

  const form = await browser.newPage()
  watch(form, 'form')
  await form.goto(`${http.origin}/form`, { waitUntil: 'domcontentloaded' })

  const formTabId = await worker.evaluate(async (origin) => {
    const tabs = await chrome.tabs.query({})
    return tabs.find((item) => item.url && item.url.startsWith(origin) && item.url.endsWith('/form'))?.id
  }, http.origin)
  let probed = null
  for (let attempt = 0; attempt < 20; attempt += 1) {
    probed = await worker.evaluate(async (tabId) => {
      if (tabId === undefined) return { error: 'form tab missing' }
      const flags = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: () => ({
          installed: Boolean(globalThis.__formwhisperContent),
          seen: Boolean(globalThis.__formwhisperSeen),
          href: location.href,
        }),
      })
      let scan = null
      try {
        scan = await chrome.tabs.sendMessage(tabId, { target: 'formwhisper-page', type: 'SCAN' })
      } catch (error) {
        scan = { error: String(error) }
      }
      return { flags, scan }
    }, formTabId)
    if (probed.flags?.[0]?.result?.installed) break
    await form.waitForTimeout(250)
  }
  if (!probed?.flags?.[0]?.result?.installed) {
    throw new Error(`Content script did not install on the form page: ${JSON.stringify(probed)}`)
  }
  if (probed.flags?.[1]?.result?.installed) {
    throw new Error(`Content script installed in a child frame: ${JSON.stringify(probed.flags)}`)
  }
  const labels = (probed.scan?.fields || []).map((field) => field.label)
  if (!labels.some((label) => /first name/i.test(String(label)))) {
    throw new Error(`Form scan failed: ${JSON.stringify(probed.scan)}`)
  }

  const empty = await browser.newPage()
  watch(empty, 'empty')
  await empty.goto(`${http.origin}/empty`, { waitUntil: 'domcontentloaded' })
  const emptyTabId = await worker.evaluate(async (origin) => {
    const tabs = await chrome.tabs.query({})
    return tabs.find((item) => item.url === `${origin}/empty`)?.id
  }, http.origin)
  let emptyProbe = null
  for (let attempt = 0; attempt < 20; attempt += 1) {
    emptyProbe = await worker.evaluate(async (tabId) => {
      const flags = await chrome.scripting.executeScript({
        target: { tabId, allFrames: false },
        func: () => ({
          installed: Boolean(globalThis.__formwhisperContent),
          seen: Boolean(globalThis.__formwhisperSeen),
        }),
      })
      return flags[0]?.result
    }, emptyTabId)
    if (emptyProbe?.seen) break
    await empty.waitForTimeout(250)
  }
  if (!emptyProbe?.seen) throw new Error(`Content script did not run on the empty page: ${JSON.stringify(emptyProbe)}`)
  if (emptyProbe.installed) throw new Error('Content script installed listeners on a page with no fields')

  const video = await browser.newPage()
  watch(video, 'youtube')
  await video.goto('https://www.youtube.com/watch?v=jNQXAC9IVRw', { waitUntil: 'domcontentloaded', timeout: 45000 })
  await video.waitForTimeout(2500)

  if (recaptcha.length) throw new Error(`reCAPTCHA was requested:\n${recaptcha.join('\n')}`)
  if (problems.length) throw new Error(problems.join('\n'))
  console.log('Extension check passed', { extensionId, frames: probed.flags.map((item) => item.result) })
} finally {
  if (browser) await browser.close().catch(() => {})
  if (http) http.server.close()
  if (userData) await rm(userData, { recursive: true, force: true })
  await rm(configPath, { force: true })
}
