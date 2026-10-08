import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { classifyDegradations } from '@/constants/engine'
import { EngineBanner } from './EngineBanner'

/** The DeepSeek session of 09/10/2026: engine gaps, images refused by the model, context window probed. */
const DEEPSEEK_DEGRADED = ['message_queue', 'auto_continue', 'nats', 'enrichment', 'images']
const DEEPSEEK_CAPS = { images: false, tools: true, resume: true, context_window: { value: 131072, source: 'probed' } }

describe('classifyDegradations', () => {
  it('sorts the DeepSeek list into engine gaps and one model limit', () => {
    expect(classifyDegradations(DEEPSEEK_DEGRADED, DEEPSEEK_CAPS)).toEqual([
      { id: 'message_queue', cause: 'harness' },
      { id: 'auto_continue', cause: 'harness' },
      { id: 'nats', cause: 'harness' },
      { id: 'enrichment', cause: 'harness' },
      { id: 'images', cause: 'model' },
    ])
  })

  it('hooks and unknown ids are engine gaps', () => {
    expect(classifyDegradations(['hooks', 'brand_new_thing'], null).map((d) => d.cause)).toEqual(['harness', 'harness'])
  })

  it('a capability the model declares present is the engine’s gap, never the model’s', () => {
    expect(classifyDegradations(['images'], { images: true })).toEqual([{ id: 'images', cause: 'harness' }])
  })

  it('an unknown context window is "not probed yet", a known one says nothing', () => {
    expect(classifyDegradations(['nats'], { context_window: null })).toContainEqual({ id: 'context_window', cause: 'unprobed' })
    expect(classifyDegradations(['nats'], { context_window: { value: 200000, source: 'probed' } })).toEqual([
      { id: 'nats', cause: 'harness' },
    ])
    // Not declared at all: nothing said, nothing shown.
    expect(classifyDegradations(['nats'], {})).toEqual([{ id: 'nats', cause: 'harness' }])
  })

  it('present capabilities yield nothing: no "cannot call tools" or "no long context" for a model that has them', () => {
    const items = classifyDegradations([], { images: true, tools: true, resume: true, context_window: { value: 1, source: 'reported' } })
    expect(items).toEqual([])
  })

  it('declared limits are listed even when the engine did not name them', () => {
    expect(classifyDegradations(['nats'], { tools: false })).toContainEqual({ id: 'tools', cause: 'model' })
  })
})

describe('EngineBanner', () => {
  it('shows nothing when the engine lists no missing feature', () => {
    render(<EngineBanner degraded={[]} declared={{ images: false }} />)
    expect(screen.queryByTestId('engine-banner')).toBeNull()
  })

  it('DeepSeek: engine gaps are said to be ours, images the model’s, and nothing else', () => {
    render(<EngineBanner degraded={DEEPSEEK_DEGRADED} declared={DEEPSEEK_CAPS} />)
    const banner = screen.getByTestId('engine-banner')
    expect(banner.getAttribute('role')).toBe('note')

    const harness = screen.getByTestId('engine-banner-harness')
    expect(harness.textContent).toMatch(/Not yet carried by the Project Orchestrator agent engine/)
    expect(harness.textContent).toMatch(/not a limit of the model/)
    expect(harness.textContent).toMatch(/refused instead of queued/)
    expect(harness.textContent).toMatch(/Auto-continue/)
    expect(harness.textContent).toMatch(/NATS/)
    expect(harness.textContent).toMatch(/enrichment/i)
    expect(harness.textContent).not.toMatch(/image/i)

    const model = screen.getByTestId('engine-banner-model')
    expect(model.textContent).toMatch(/Limits of this model or provider/)
    expect(within(model).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['This model does not accept images'])

    // Probed context window, tools present, resume present: none of it is mentioned.
    expect(screen.queryByTestId('engine-banner-unprobed')).toBeNull()
    expect(banner.textContent).not.toMatch(/cannot call tools|resume|context/i)
  })

  it('an unknown context window reads "not probed yet", not "no long context"', () => {
    render(<EngineBanner degraded={['nats']} declared={{ context_window: null }} />)
    const unprobed = screen.getByTestId('engine-banner-unprobed')
    expect(unprobed.textContent).toMatch(/Not measured yet/)
    expect(unprobed.textContent).toMatch(/not probed yet: this does not mean the model lacks a long context/)
  })

  it('each cause is named in words with its own heading, never by colour alone', () => {
    render(<EngineBanner degraded={['hooks', 'images']} declared={{ images: false, context_window: null }} />)
    for (const cause of ['harness', 'model', 'unprobed']) {
      const section = screen.getByTestId(`engine-banner-${cause}`)
      expect(section.getAttribute('aria-label')).toBeTruthy()
      expect(section.textContent).toContain(section.getAttribute('aria-label')!)
    }
  })

  it('keeps an unknown id visible, as an engine gap', () => {
    render(<EngineBanner degraded={['hooks', 'brand_new_thing']} />)
    const harness = screen.getByTestId('engine-banner-harness')
    expect(harness.textContent).toMatch(/Hooks .* do not run yet/)
    expect(harness.textContent).toMatch(/brand new thing: not available yet/)
  })
})
