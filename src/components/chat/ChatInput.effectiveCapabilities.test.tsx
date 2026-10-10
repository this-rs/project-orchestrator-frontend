/**
 * F-R4 — the capabilities shown follow the SET of routing candidates, not the snapshot of the
 * opening model: the composer takes an image when PO can route the turn to a model that reads it,
 * the banner stops saying "this model does not accept images", and a pool without any vision model
 * (or not probed yet) still says so, with its cause.
 *
 * Run with: npx vitest run src/components/chat/ChatInput.effectiveCapabilities.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import {
  chatSessionCapabilitiesSnapshotAtom,
  chatSessionDeclaredFactsAtom,
  chatSessionEffectiveCapabilitiesStateAtom,
  chatSessionEngineAtom,
  chatSessionEngineFactsAtom,
  chatSessionIdAtom,
  chatSessionProviderAtom,
} from '@/atoms'
import { classifyDegradations, withEffectiveImages } from '@/constants/engine'
import type { EffectiveCapabilities, EffectiveCause, EffectiveSource } from '@/types/chat'
import { ChatInput } from './ChatInput'
import { EngineBanner } from './EngineBanner'

vi.mock('@/hooks', () => ({ useIsMobile: () => false }))
vi.mock('@/services/chat', () => ({
  chatApi: { getPermissionConfig: () => Promise.resolve({ mode: 'default' }) },
}))
vi.mock('@/services/documents', () => ({
  documentsApi: { upload: vi.fn(() => new Promise(() => {})) },
}))

const { documentsApi } = await import('@/services/documents')
const uploadMock = documentsApi.upload as unknown as ReturnType<typeof vi.fn>

const png = new File([new Uint8Array([1])], 'shot.png', { type: 'image/png' })
const MODEL_REFUSAL = 'This model does not accept images'

function effective(value: boolean, source: EffectiveSource, cause: EffectiveCause): EffectiveCapabilities {
  return { images: { value, source, cause, via: value && source === 'routing_pool' ? [{ provider: 'deepseek', model: 'vision' }] : [] } }
}

/** The measured case: deepseek-flash, `routed_by: auto`, `images: false` in the snapshot. */
function storeWith(images: EffectiveCapabilities | null, sessionId = 's1') {
  const store = createStore()
  store.set(chatSessionIdAtom, 's1')
  store.set(chatSessionProviderAtom, { id: 'deepseek', kind: 'openai_compatible' })
  store.set(chatSessionCapabilitiesSnapshotAtom, { images: false, tools: true, resume: true, per_session_mcp: true, context_window: { value: 1048576, source: 'probed' } } as never)
  store.set(chatSessionEngineAtom, { engine: 'agent', degraded: ['images'] })
  if (images) store.set(chatSessionEffectiveCapabilitiesStateAtom, { sessionId, capabilities: images })
  return store
}

function renderComposer(store: ReturnType<typeof createStore>) {
  const utils = render(
    <Provider store={store}>
      <ChatInput onSend={vi.fn()} onQueue={() => {}} onQueueOp={() => {}} onInterrupt={vi.fn()} isStreaming={false} sessionId="s1" />
    </Provider>,
  )
  return utils.container.querySelector('input[type="file"]') as HTMLInputElement
}

function renderBanner(store: ReturnType<typeof createStore>) {
  return render(
    <Provider store={store}>
      <EngineBanner degraded={store.get(chatSessionEngineFactsAtom).degraded} declared={store.get(chatSessionDeclaredFactsAtom)} />
    </Provider>,
  )
}

beforeEach(() => {
  uploadMock.mockClear()
})

describe('a pool with a model that reads images (mixed / full)', () => {
  it('the composer takes the image: the turn will be routed to that model', () => {
    const fileInput = renderComposer(storeWith(effective(true, 'routing_pool', 'pool_has_it')))
    fireEvent.change(fileInput, { target: { files: [png] } })
    expect(uploadMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('images-refused')).toBeNull()
  })

  it('the banner does not mention images at all', () => {
    renderBanner(storeWith(effective(true, 'routing_pool', 'pool_has_it')))
    expect(screen.queryByTestId('engine-banner')).toBeNull()
    expect(document.body.textContent).not.toContain(MODEL_REFUSAL)
  })
})

describe('a pool without any model that reads images', () => {
  it('the composer still turns the image away, and says the POOL lacks it', () => {
    const fileInput = renderComposer(storeWith(effective(false, 'routing_pool', 'pool_lacks_it')))
    fireEvent.change(fileInput, { target: { files: [png] } })
    expect(uploadMock).not.toHaveBeenCalled()
    const notice = screen.getByTestId('images-refused').textContent ?? ''
    expect(notice).toContain('No model PO can route this conversation to accepts images')
    expect(notice).toContain('shot.png')
  })

  it('the banner says so, once, as a limit of the models within reach', () => {
    renderBanner(storeWith(effective(false, 'routing_pool', 'pool_lacks_it')))
    const banner = screen.getByTestId('engine-banner').textContent ?? ''
    expect(banner).toContain('No model PO can route this conversation to accepts images')
    expect(banner).not.toContain(MODEL_REFUSAL)
    expect(screen.getByTestId('engine-banner-model')).toBeTruthy()
  })
})

describe('an empty or unbuilt pool: the snapshot, with its cause', () => {
  it('composer and banner say the model refuses AND that nothing else was probed', () => {
    const store = storeWith(effective(false, 'snapshot', 'pool_unbuilt'))
    const fileInput = renderComposer(store)
    fireEvent.change(fileInput, { target: { files: [png] } })
    expect(uploadMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('images-refused').textContent).toMatch(/not probed yet/)
  })

  it('the banner names the cause instead of the bare model line', () => {
    renderBanner(storeWith(effective(false, 'snapshot', 'pool_unbuilt')))
    const banner = screen.getByTestId('engine-banner').textContent ?? ''
    expect(banner).toMatch(/routing pool is not probed yet/)
  })
})

describe('no routing (primary), or nothing said: exactly as before', () => {
  it.each([
    ['primary', effective(false, 'snapshot', 'not_routed')],
    ['no router', effective(false, 'snapshot', 'no_router')],
    ['nothing said', null],
  ])('%s — the model line and the refusal stay', (_label, fact) => {
    const store = storeWith(fact)
    const fileInput = renderComposer(store)
    fireEvent.change(fileInput, { target: { files: [png] } })
    expect(uploadMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('images-refused').textContent).toContain(MODEL_REFUSAL)
  })

  it('a fact said for ANOTHER session never leaks into this one', () => {
    const fileInput = renderComposer(storeWith(effective(true, 'routing_pool', 'pool_has_it'), 'other-session'))
    fireEvent.change(fileInput, { target: { files: [png] } })
    expect(uploadMock).not.toHaveBeenCalled()
  })
})

describe('withEffectiveImages (the banner text source)', () => {
  const declared = { images: false, tools: true }

  it('returns the very same inputs when nothing changes', () => {
    const degraded = ['images', 'hooks']
    for (const fact of [null, effective(false, 'snapshot', 'not_routed'), effective(true, 'snapshot', 'model_has_it')]) {
      const out = withEffectiveImages(degraded, declared, fact)
      expect(out.degraded).toBe(degraded)
      expect(out.declared).toBe(declared)
    }
  })

  it('a reachable vision model removes the images line, other gaps stay', () => {
    const out = withEffectiveImages(['images', 'hooks'], declared, effective(true, 'routing_pool', 'pool_has_it'))
    expect(classifyDegradations(out.degraded, out.declared).map((d) => d.id)).toEqual(['hooks'])
  })

  it('even when only the declaration said images: false (no engine entry)', () => {
    const out = withEffectiveImages([], declared, effective(true, 'routing_pool', 'pool_has_it'))
    expect(classifyDegradations(out.degraded, out.declared)).toEqual([])
  })

  it('a pool without vision and an unbuilt pool are model-side limits, never our engine', () => {
    for (const [fact, id] of [
      [effective(false, 'routing_pool', 'pool_lacks_it'), 'routing_images'],
      [effective(false, 'snapshot', 'pool_unbuilt'), 'images_pool_unbuilt'],
    ] as const) {
      const out = withEffectiveImages(['images'], declared, fact)
      expect(classifyDegradations(out.degraded, out.declared)).toEqual([{ id, cause: 'model' }])
    }
  })
})
