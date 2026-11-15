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

async function studio(form) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } })
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
  await page.getByRole('heading', { name: 'Nothing in the margin yet' }).waitFor()
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

await browser.close()
console.log('Wrote docs/screenshots')
