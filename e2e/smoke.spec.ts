import { test, expect } from '@playwright/test'

test.describe('gateway + SPA smoke', () => {
  test('health endpoint is ok', async ({ request }) => {
    const res = await request.get('/health')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.protocol).toBe('mock')
  })

  test('config endpoint returns public fields', async ({ request }) => {
    const res = await request.get('/config')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.protocol).toBe('mock')
    expect(typeof body.authRequired).toBe('boolean')
  })

  test('SPA loads and shows login shell', async ({ page }) => {
    await page.goto('/')
    // AppChrome brand or login form should render
    await expect(page.locator('#root')).toBeVisible()
    const text = await page.locator('body').innerText()
    expect(text.length).toBeGreaterThan(10)
  })

  test('mock connect via UI is reachable (fields present)', async ({ page }) => {
    await page.goto('/')
    // LoginView uses address + nickname inputs
    const inputs = page.locator('input')
    await expect(inputs.first()).toBeVisible({ timeout: 10_000 })
    const count = await inputs.count()
    expect(count).toBeGreaterThan(0)
  })
})
