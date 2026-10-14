import { chromium } from 'playwright'

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome 2.app/Contents/MacOS/Google Chrome',
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', msg => {
  if (msg.type() === 'error') console.log('console.error:', msg.text())
})
page.on('pageerror', err => console.log('pageerror:', err.message))

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForSelector('#la-email', { timeout: 15000 })
await page.screenshot({ path: 'output/01-login.png', fullPage: false })

await page.fill('#la-email', 'admin@logearn.com')
await page.fill('#la-password', 'admin1234')
await page.click('#la-login-submit')

await page.waitForSelector('#la-login-overlay', { state: 'detached', timeout: 30000 }).catch(() => {})
await page.waitForTimeout(3000)
await page.screenshot({ path: 'output/02-dashboard.png', fullPage: false })

const title = await page.title()
const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1000))
console.log('title:', title)
console.log('body preview:\n', bodyText)
await browser.close()
