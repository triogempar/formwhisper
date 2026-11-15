import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const base = process.env.FORMWHISPER_URL || 'http://127.0.0.1:43123'
const profile = {
  legalName: 'Mara Ellison',
  preferredName: 'Mara',
  dateOfBirth: '1987-03-14',
  email: 'mara.ellison@example.com',
  phone: '+1 415 555 0142',
  addressLine1: '418 West Cedar Street',
  addressLine2: 'Apartment 3',
  city: 'Port Meridian',
  region: 'Northshore',
  postalCode: '94107',
  country: 'United States',
  nationality: 'United States',
  occupation: 'Harbor cartographer',
  employer: 'Cedar & Tide Survey',
  taxId: 'NS-000-00-0142',
  nationalId: 'NS-ID-448291',
  passportNumber: 'AL0000000',
  driversLicense: 'NS-DL-000142',
}

mkdirSync('docs/screenshots', { recursive: true })

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

async function studio(form, colorScheme = 'light') {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, colorScheme })
  await page.addInitScript(
    ({ settings, vault }) => {
      localStorage.setItem('fw.settings', JSON.stringify(settings))
      localStorage.setItem('fw.vault', JSON.stringify(vault))
    },
    {
      settings: { neverCloud: false, locale: 'en', onboarded: true },
      vault: { v: 1, encrypted: false, profile },
    },
  )
  await page.goto(`${base}/preview/studio.html?form=${form}`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'No field selected' }).waitFor()
  return page
}

const tax = await studio('tax')
const taxFrame = tax.frameLocator('#fw-form-frame')
await taxFrame.locator('#legal-name').focus()
await tax.locator('section').getByText('identity papers').waitFor()
await tax.getByRole('button', { name: 'Fill' }).click()
await tax.getByText('Placed in the field.').waitFor()
const filled = await taxFrame.locator('#legal-name').inputValue()
if (filled !== 'Mara Ellison') throw new Error(`Fill did not land in the field: ${filled}`)
await tax.screenshot({ path: 'docs/screenshots/tax-field.png' })
await tax.close()

const bank = await studio('bank')
await bank.getByRole('button', { name: 'Page', exact: true }).click()
await bank.getByRole('button', { name: 'Read this page' }).click()
await bank.locator('article').getByText(/questions on this page/).waitFor()
await bank.screenshot({ path: 'docs/screenshots/bank-checklist.png' })
await bank.close()

const visa = await studio('visa')
const shot = await visa.locator('#fw-form-frame').screenshot({ type: 'jpeg', quality: 70 })
await visa.evaluate((data) => {
  window.__FW_FAKE_CAPTURE__ = `data:image/jpeg;base64,${data}`
}, shot.toString('base64'))
await visa.getByRole('button', { name: 'Page', exact: true }).click()
await visa.getByRole('button', { name: 'Read the visible page' }).click()
await visa.locator('article').getByText('stamp panel').first().waitFor()
await visa.screenshot({ path: 'docs/screenshots/visa-scan.png' })
await visa.close()

const dark = await studio('tax', 'dark')
const darkFrame = dark.frameLocator('#fw-form-frame')
await darkFrame.locator('#legal-name').focus()
await dark.locator('section').getByText('identity papers').waitFor()
await dark.screenshot({ path: 'docs/screenshots/tax-field-dark.png' })
await dark.close()

async function panelPage(form, { colorScheme, onboarded, width }) {
  const page = await browser.newPage({ viewport: { width: width + 720, height: 980 }, colorScheme })
  await page.addInitScript(
    ({ settings, vault }) => {
      localStorage.setItem('fw.settings', JSON.stringify(settings))
      localStorage.setItem('fw.vault', JSON.stringify(vault))
    },
    {
      settings: { neverCloud: false, locale: 'en', onboarded },
      vault: { v: 1, encrypted: false, profile },
    },
  )
  await page.goto(`${base}/preview/studio.html?form=${form}`, { waitUntil: 'domcontentloaded' })
  await page.addStyleTag({ content: `body{grid-template-columns:minmax(0,1fr) ${width}px !important;}` })
  await page.getByRole('heading', { name: onboarded ? 'No field selected' : 'Understand any form field' }).waitFor()
  return page
}

async function savePanel(page, name) {
  await page.locator('#root').screenshot({ path: `docs/screenshots/${name}.png` })
}

const onboard = await panelPage('tax', { colorScheme: 'dark', onboarded: false, width: 420 })
await savePanel(onboard, 'field-onboarding-dark')
await onboard.close()

for (const width of [360, 420, 500]) {
  for (const colorScheme of ['light', 'dark']) {
    const page = await panelPage('tax', { colorScheme, onboarded: true, width })
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const report = await page.evaluate(() => {
      const root = document.querySelector('#root').getBoundingClientRect().left
      const box = (selector) => {
        const el = document.querySelector(selector)
        if (!el) return { selector, missing: true }
        const style = getComputedStyle(el)
        return {
          selector,
          left: Math.round(el.getBoundingClientRect().left - root),
          font: style.fontSize,
          weight: style.fontWeight,
        }
      }
      const tiny = [...document.querySelectorAll('#root *')]
        .filter((el) => el.childNodes && [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()))
        .map((el) => ({ tag: el.tagName, font: getComputedStyle(el).fontSize, text: el.textContent.trim().slice(0, 40) }))
        .filter((item) => parseFloat(item.font) < 12)
      return {
        edges: [
          '.row strong',
          '.row .help',
          '.field > span',
          '.field select',
          '.field .help',
          '.actions .btn',
        ].map(box),
        tiny,
      }
    })
    const lefts = report.edges.filter((item) => !item.missing).map((item) => item.left)
    const off = [...new Set(lefts)]
    const padding = await page.evaluate(() => getComputedStyle(document.querySelector('.row')).paddingLeft)
    if (off.length !== 1 || padding !== '16px' || report.tiny.length) {
      console.log(JSON.stringify({ width, colorScheme, report }, null, 2))
      throw new Error(`Alignment or type size failed at ${width}px ${colorScheme}`)
    }
    if (width === 420 && colorScheme === 'dark') await savePanel(page, 'settings-dark')
    await page.getByRole('button', { name: 'Vault', exact: true }).click()
    if (width === 420 && colorScheme === 'dark') await savePanel(page, 'vault-dark')
    await page.getByRole('button', { name: 'Field', exact: true }).click()
    await page.frameLocator('#fw-form-frame').locator('#legal-name').focus()
    await page.locator('section').getByText('identity papers').waitFor()
    if (width === 420 && colorScheme === 'dark') await savePanel(page, 'field-explanation-dark')
    if (width === 420 && colorScheme === 'light') await savePanel(page, 'field-explanation-light')
    await page.close()
  }
}

await browser.close()
console.log('Wrote docs/screenshots')
