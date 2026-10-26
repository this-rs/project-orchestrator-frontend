import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installChunkReload, WINDOW_MS } from './chunkReload'

const makeWindow = () => {
  const store = new Map<string, string>()
  const target = new EventTarget()
  const reload = vi.fn()
  return {
    win: {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
      location: { reload },
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
    } as unknown as Window,
    store,
    reload,
    fire: () => target.dispatchEvent(new Event('vite:preloadError', { cancelable: true })),
  }
}

describe('chunk reload — a stale tab picks up the new build', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('reloads once when a lazy chunk fails to load', () => {
    const { win, reload, fire } = makeWindow()
    installChunkReload(win, () => 1_000)
    fire()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not loop when the chunk is genuinely missing', () => {
    const { win, reload, fire } = makeWindow()
    installChunkReload(win, () => 1_000)
    fire()
    fire()
    fire()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('tries again once the window has passed', () => {
    const { win, reload, fire } = makeWindow()
    let clock = 1_000
    installChunkReload(win, () => clock)
    fire()
    clock += WINDOW_MS + 1
    fire()
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('uninstalls cleanly', () => {
    const { win, reload, fire } = makeWindow()
    const off = installChunkReload(win, () => 1_000)
    off()
    fire()
    expect(reload).not.toHaveBeenCalled()
  })
})
