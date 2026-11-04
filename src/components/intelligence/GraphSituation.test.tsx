import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GraphSituation } from './GraphSituation'

describe('GraphSituation', () => {
  it('shows the four counts and the detail tier', () => {
    render(<GraphSituation nodeCount={120} groupCount={1} edgeCount={340} layers={['code', 'knowledge']} scale={0} />)
    const el = screen.getByRole('status')
    expect(el.textContent).toMatch(/^detail/)
    expect(screen.getByText('120')).toBeTruthy()
    expect(screen.getByText('1')).toBeTruthy()
    expect(screen.getByText('340')).toBeTruthy()
    expect(screen.getByText('code · knowledge')).toBeTruthy()
  })

  it('names the groups tier when aggregated, with N groups', () => {
    render(<GraphSituation nodeCount={9} groupCount={9} edgeCount={14} layers={['code']} scale={2} />)
    expect(screen.getByRole('status').textContent).toMatch(/^groups/)
  })

  it('on a 390px screen: one truncating line, full text kept in title, layers collapsed to a count', () => {
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true })
    const layers = ['code', 'knowledge', 'fabric', 'neural', 'skills']
    render(<GraphSituation nodeCount={123456} groupCount={87} edgeCount={654321} layers={layers} scale={1} />)
    const el = screen.getByRole('status')
    expect(el.className).toContain('max-w-[calc(100%-1.5rem)]')
    expect(el.firstElementChild?.className).toContain('truncate')
    expect(el.firstElementChild?.className).toContain('whitespace-nowrap')
    expect(el.getAttribute('title')).toContain('code, knowledge, fabric, neural, skills')
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.queryByText('code · knowledge · fabric · neural · skills')).toBeNull()
  })
})
