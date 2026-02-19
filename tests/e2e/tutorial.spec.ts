import { test, expect } from '@playwright/test'
import { mockApiForTutorialTests } from './helpers/tutorial'

// ---------------------------------------------------------------------------
// Welcome Modal & Main Tour
// ---------------------------------------------------------------------------

test.describe('Tutorial — Welcome modal', () => {
  test.beforeEach(async ({ page }) => {
    await mockApiForTutorialTests(page)
    await page.goto('/')
    // Clear tutorial state to simulate first-time user
    await page.evaluate(() => localStorage.removeItem('po-tutorials'))
    await page.reload()
  })

  test('shows the welcome modal for first-time users', async ({ page }) => {
    const title = page.getByText('Bienvenue sur Project Orchestrator')
    await expect(title).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /démarrer le tour/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /explorer par moi/i })).toBeVisible()
  })

  test('starts the main tour when clicking "Démarrer"', async ({ page }) => {
    const startBtn = page.getByRole('button', { name: /démarrer le tour/i })
    await startBtn.waitFor({ state: 'visible', timeout: 5000 })
    await startBtn.click()

    // Wait for welcome modal close animation + tour start delay (250ms)
    await page.waitForTimeout(800)

    // NextStepjs pointer overlay should be visible
    const pointer = page.locator('[data-name="nextstep-pointer"]')
    await expect(pointer).toBeVisible({ timeout: 5000 })
  })

  test('dismisses the welcome modal when clicking "Explorer"', async ({ page }) => {
    const dismissBtn = page.getByRole('button', { name: /explorer par moi/i })
    await dismissBtn.waitFor({ state: 'visible', timeout: 5000 })
    await dismissBtn.click()

    await expect(
      page.getByText('Bienvenue sur Project Orchestrator'),
    ).not.toBeVisible({ timeout: 3000 })
  })

  test('does not re-show the welcome modal after completing the tour', async ({ page }) => {
    // Simulate completing the main tour by clicking "Démarrer" then completing it
    // For speed, we just seed the completion state and verify the modal doesn't show
    await page.evaluate(() => {
      localStorage.setItem(
        'po-tutorials',
        JSON.stringify({
          tours: { main: { completed: true, completedAt: new Date().toISOString(), skippedAt: null } },
          dismissed: {},
        }),
      )
    })
    await page.reload()

    // Wait long enough for the modal to appear if it were going to
    await page.waitForTimeout(2500)
    await expect(
      page.getByText('Bienvenue sur Project Orchestrator'),
    ).not.toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Tutorial Button & Reset
// ---------------------------------------------------------------------------

test.describe('Tutorial — Button & dropdown', () => {
  test.beforeEach(async ({ page }) => {
    await mockApiForTutorialTests(page)
    await page.goto('/')
    // Pre-seed as "not first time" user — main tour was skipped
    // This prevents the welcome modal from appearing and blocking clicks
    await page.evaluate(() => {
      localStorage.setItem(
        'po-tutorials',
        JSON.stringify({
          tours: { main: { completed: true, completedAt: new Date().toISOString(), skippedAt: null } },
          dismissed: {},
        }),
      )
    })
    await page.reload()
    await page.waitForTimeout(1500)
  })

  test('header button opens dropdown with tour list', async ({ page }) => {
    const btn = page.locator('[data-tour="tutorial-button"]')
    await btn.waitFor({ state: 'visible', timeout: 5000 })
    await btn.click()

    await expect(page.getByText('Tours guidés')).toBeVisible()
    await expect(page.getByText(/\d+\/\d+ complétés/)).toBeVisible()
  })

  test('clicking a tour in the dropdown starts it', async ({ page }) => {
    const btn = page.locator('[data-tour="tutorial-button"]')
    await btn.waitFor({ state: 'visible', timeout: 5000 })
    await btn.click()

    await page.getByText('Relancer le tour principal').click()
    await page.waitForTimeout(500)

    const pointer = page.locator('[data-name="nextstep-pointer"]')
    await expect(pointer).toBeVisible({ timeout: 5000 })
  })

  test('skip during a tour closes it properly', async ({ page }) => {
    const btn = page.locator('[data-tour="tutorial-button"]')
    await btn.waitFor({ state: 'visible', timeout: 5000 })
    await btn.click()
    await page.getByText('Relancer le tour principal').click()

    await page.waitForTimeout(500)
    const pointer = page.locator('[data-name="nextstep-pointer"]')
    await expect(pointer).toBeVisible({ timeout: 5000 })

    // Click "Passer le tour"
    const skipBtn = page.getByRole('button', { name: /passer le tour/i })
    await skipBtn.click()

    // Pointer overlay should disappear
    await expect(pointer).not.toBeVisible({ timeout: 5000 })
  })

  test('reset all tours clears completion state', async ({ page }) => {
    // Pre-seed with a completed tour + skipped main
    await page.evaluate(() => {
      localStorage.setItem(
        'po-tutorials',
        JSON.stringify({
          tours: {
            main: { completed: true, completedAt: '2026-01-01T00:00:00Z', skippedAt: null },
            'plan-list': { completed: true, completedAt: '2026-01-01T00:00:00Z', skippedAt: null },
          },
          dismissed: { 'plan-list': true },
        }),
      )
    })
    await page.reload()
    await page.waitForTimeout(1000)

    const btn = page.locator('[data-tour="tutorial-button"]')
    await btn.waitFor({ state: 'visible', timeout: 5000 })
    await btn.click()

    await page.getByText('Réinitialiser tous les tours').click()
    await page.getByText('Confirmer la réinitialisation').click()

    await page.waitForTimeout(500)

    const state = await page.evaluate(() => {
      const raw = localStorage.getItem('po-tutorials')
      return raw ? JSON.parse(raw) : null
    })
    expect(state?.tours).toBeDefined()
    expect(Object.keys(state?.tours ?? {})).toHaveLength(0)
  })
})
