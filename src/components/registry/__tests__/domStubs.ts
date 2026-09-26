/**
 * jsdom lacks a few browser APIs the Skills / Personas pages rely on:
 * - matchMedia (motion/react `useReducedMotion` in dialogs)
 * - IntersectionObserver (useInfiniteList sentinel, useSectionObserver)
 * Call once at the top of a test file (idempotent).
 */
export function installDomStubs() {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
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
    Object.defineProperty(window, 'IntersectionObserver', { value: IO, writable: true, configurable: true })
    Object.defineProperty(globalThis, 'IntersectionObserver', { value: IO, writable: true, configurable: true })
  }
}
