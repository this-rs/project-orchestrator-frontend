/**
 * Shared helpers for page tests: jsdom lacks matchMedia (useReducedMotion,
 * useIsMobile) and IntersectionObserver (infinite lists); every page lives
 * under `/workspace/:slug/...` (useWorkspaceSlug) and reads jotai atoms
 * (a fresh Provider per render keeps tests isolated).
 */
import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Provider } from 'jotai'

export function installDomStubs() {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('min-width'), // desktop by default
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia
  }
  if (!('IntersectionObserver' in window)) {
    class IO {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return []
      }
    }
    ;(window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO
  }
}

interface RenderAtOptions {
  /** Route pattern, e.g. `/workspace/:slug/plans/:planId` */
  pattern: string
  /** Initial location (may carry router state). */
  entry: string | { pathname: string; search?: string; state?: unknown }
}

/** Render a page inside a MemoryRouter at a workspace-scoped route. */
export function renderAt(element: ReactElement, { pattern, entry }: RenderAtOptions) {
  return render(
    <Provider>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path={pattern} element={element} />
          <Route path="*" element={<div data-testid="elsewhere" />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

/** Event bus stub for `@/services` mocks (useCrudEventSync subscribes on mount). */
export const eventBusStub = () => ({ on: () => () => {}, off: () => {}, emit: () => {} })
