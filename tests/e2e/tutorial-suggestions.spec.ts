import { test, expect } from '@playwright/test'
import { mockApiForTutorialTests, mockPlansApi } from './helpers/tutorial'

// ---------------------------------------------------------------------------
// Tour Suggestion Toasts (micro-tours)
// ---------------------------------------------------------------------------

test.describe('Tutorial — Tour suggestions', () => {
  test.beforeEach(async ({ page }) => {
    await mockApiForTutorialTests(page)
    await page.goto('/')
    // Pre-seed as "not first time" user — main tour completed
    // This prevents welcome modal and allows tour suggestions to appear
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
    await page.waitForTimeout(500)
  })

  test('shows suggestion toast after delay on /plans', async ({ page }) => {
    await page.goto('/plans')

    // Toast should NOT be visible immediately
    await expect(page.locator('[role="status"]')).not.toBeVisible()

    // Wait for SUGGESTION_DELAY (1500ms) + buffer
    await page.waitForTimeout(2500)

    // Toast should now be visible
    const toast = page.locator('[role="status"]')
    await expect(toast).toBeVisible({ timeout: 3000 })

    // Verify toast content (scoped to the toast to avoid matching welcome modal text)
    await expect(toast.getByText(/découvrez les fonctionnalités/i)).toBeVisible()
  })

  test('dismiss persists after reload', async ({ page }) => {
    await page.goto('/plans')

    // Wait for toast to appear
    await page.waitForTimeout(2500)
    const toast = page.locator('[role="status"]')
    await expect(toast).toBeVisible({ timeout: 3000 })

    // Click "Plus tard" to dismiss (scoped to toast)
    await toast.getByRole('button', { name: /plus tard/i }).click()
    await expect(toast).not.toBeVisible({ timeout: 2000 })

    // Reload — toast should NOT reappear
    await page.reload()
    await page.waitForTimeout(3000)
    await expect(page.locator('[role="status"]')).not.toBeVisible()
  })

  test('clicking "Commencer" on toast launches micro-tour', async ({ page }) => {
    // Mock plans API so the plans list renders its data-tour target elements
    await mockPlansApi(page)
    await page.goto('/plans')

    // Wait for toast
    await page.waitForTimeout(2500)
    const toast = page.locator('[role="status"]')
    await expect(toast).toBeVisible({ timeout: 3000 })

    // Click "Commencer" to start the micro-tour (scoped to toast)
    await toast.getByRole('button', { name: /commencer/i }).click()

    await page.waitForTimeout(500)

    // NextStepjs pointer overlay should be visible
    const pointer = page.locator('[data-name="nextstep-pointer"]')
    await expect(pointer).toBeVisible({ timeout: 5000 })
  })

  test('auto-dismisses after timeout without interaction', async ({ page }) => {
    test.slow() // This test needs extra time (11+ seconds total)

    await page.goto('/plans')

    // Wait for toast to appear
    await page.waitForTimeout(2500)
    const toast = page.locator('[role="status"]')
    await expect(toast).toBeVisible({ timeout: 3000 })

    // Wait for SUGGESTION_AUTO_HIDE (8000ms) + buffer
    await page.waitForTimeout(9000)

    // Toast should have auto-dismissed
    await expect(toast).not.toBeVisible({ timeout: 3000 })
  })
})
