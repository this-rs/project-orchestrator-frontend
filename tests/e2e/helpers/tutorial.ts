import type { Page } from '@playwright/test'

const STORAGE_KEY = 'po-tutorials'

/**
 * Mock the backend API routes required for the app to boot without auth.
 *
 * Intercepts:
 * - GET /api/setup-status → { configured: true }
 * - GET /auth/providers → { auth_required: false, providers: [], allow_registration: false }
 * - POST /auth/refresh → 401 (no token)
 * - POST /auth/logout → 200
 * - Any other /api/* call → empty 200 JSON array
 *
 * Must be called BEFORE navigating to the app.
 */
export async function mockApiForTutorialTests(page: Page) {
  // Setup status — configured
  await page.route('**/api/setup-status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ configured: true }),
    }),
  )

  // Auth providers — no auth required (bypass login)
  await page.route('**/auth/providers', (route) => {
    // Skip source file requests (Vite HMR)
    if (route.request().url().includes('/src/')) return route.fallback()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        auth_required: false,
        providers: [],
        allow_registration: false,
      }),
    })
  })

  // Auth refresh — no valid cookie
  await page.route('**/auth/refresh', (route) => {
    if (route.request().url().includes('/src/')) return route.fallback()
    return route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'no_token' }),
    })
  })

  // Auth logout — ok
  await page.route('**/auth/logout', (route) => {
    if (route.request().url().includes('/src/')) return route.fallback()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    })
  })

  // Fallback for other API calls — return empty arrays
  await page.route('**/api/**', (route) => {
    const url = route.request().url()
    if (url.includes('/setup-status')) return route.fallback()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })
}

/**
 * Clear all tutorial state from localStorage.
 * Call in beforeEach to ensure a clean slate.
 */
export async function clearTutorialState(page: Page) {
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
}

/**
 * Get the current tutorial state from localStorage.
 */
export async function getTutorialState(page: Page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  }, STORAGE_KEY)
}

/**
 * Set tutorial state in localStorage (for pre-seeding test scenarios).
 */
export async function setTutorialState(page: Page, state: Record<string, unknown>) {
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: STORAGE_KEY, value: state },
  )
}

/**
 * Mock /api/plans to return a single dummy plan so the plans list page
 * renders its data-tour elements (needed for the plan-list micro-tour).
 * Must be called BEFORE navigating to /plans.
 */
export async function mockPlansApi(page: Page) {
  await page.route('**/api/plans**', (route) => {
    const url = route.request().url()
    if (url.includes('/src/')) return route.fallback()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 'fake-plan-1',
            title: 'Example Plan',
            description: 'A dummy plan for E2E testing',
            status: 'draft',
            priority: 5,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            task_count: 0,
            completed_task_count: 0,
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
        has_more: false,
      }),
    })
  })
}

/**
 * Dismiss the welcome modal if it appears (useful as a setup step).
 * Waits up to 3s for the modal — if it doesn't appear, continues silently.
 */
export async function dismissWelcomeIfPresent(page: Page) {
  try {
    const explorer = page.getByRole('button', { name: /explorer par moi/i })
    await explorer.waitFor({ state: 'visible', timeout: 3000 })
    await explorer.click()
    // Wait for modal to close
    await explorer.waitFor({ state: 'hidden', timeout: 2000 })
  } catch {
    // Modal didn't appear — that's fine
  }
}
