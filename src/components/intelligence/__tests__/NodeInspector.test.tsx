import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { intelligenceNodesAtom, selectedNodeIdAtom } from '@/atoms/intelligence'
import type { IntelligenceNode } from '@/types/intelligence'

const skillsApi = vi.hoisted(() => ({
  get: vi.fn(),
  getHealth: vi.fn(),
  getMembers: vi.fn(),
  activate: vi.fn(),
}))
const notesApi = vi.hoisted(() => ({
  get: vi.fn(),
  searchNeurons: vi.fn(),
  confirm: vi.fn(),
  invalidate: vi.fn(),
  getEntityNotes: vi.fn(),
}))
const codeApi = vi.hoisted(() => ({ getNodeImportance: vi.fn(), getFileSymbols: vi.fn() }))
const commitsApi = vi.hoisted(() => ({ getFileCoChangers: vi.fn() }))
const intelligenceApi = vi.hoisted(() => ({ getProtocol: vi.fn(), listRuns: vi.fn(), routeProtocols: vi.fn() }))

vi.mock('@/services/skills', () => ({ skillsApi }))
vi.mock('@/services/notes', () => ({ notesApi }))
vi.mock('@/services/code', () => ({ codeApi }))
vi.mock('@/services/commits', () => ({ commitsApi }))
vi.mock('@/services/intelligence', () => ({ intelligenceApi }))

import { NodeInspector } from '../NodeInspector'

function node(data: Record<string, unknown>): IntelligenceNode {
  return { id: 'n1', type: 'custom', position: { x: 0, y: 0 }, data: { entityId: 'ent-1', layer: 'code', ...data } } as unknown as IntelligenceNode
}

function renderInspector(data: Record<string, unknown>) {
  const store = createStore()
  store.set(intelligenceNodesAtom, [node(data)])
  store.set(selectedNodeIdAtom, 'n1')
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/p/proj']}>
        <Routes>
          <Route path="/p/:projectSlug" element={<NodeInspector isFullscreen />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
  return store
}

const note = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  note_type: 'gotcha',
  importance: 'high',
  content: `content of ${id}`,
  tags: ['t1'],
  status: 'active',
  ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('NodeInspector', () => {
  it('renders nothing without a selected node', () => {
    const store = createStore()
    const { container } = render(
      <Provider store={store}>
        <NodeInspector />
      </Provider>,
    )
    expect(container.innerHTML).toBe('')
  })

  it('shows a decision and closes', () => {
    const store = renderInspector({ entityType: 'decision', label: 'Use Neo4j', status: 'accepted', chosenOption: 'Neo4j' })
    expect(screen.getByText('Chosen Option')).toBeTruthy()
    expect(screen.getAllByText('Use Neo4j').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(store.get(selectedNodeIdAtom)).toBeNull()
  })

  it('shows plans, tasks, chat sessions and generic nodes', () => {
    renderInspector({ entityType: 'plan', label: 'Plan A', status: 'in_progress', priority: 3, taskCount: 1 })
    expect(screen.getByText('Priority: 3')).toBeTruthy()
    expect(screen.getByText('1 task')).toBeTruthy()
  })

  it('shows a task', () => {
    renderInspector({ entityType: 'task', label: 'Task A', status: 'some_new_status', priority: 2 })
    expect(screen.getByText('some new status')).toBeTruthy()
  })

  it('shows a chat session with and without a cost', () => {
    renderInspector({ entityType: 'chat_session', label: 'Chat', messageCount: 4, model: 'opus' })
    expect(screen.getByText('Messages')).toBeTruthy()
    expect(screen.getByText('opus')).toBeTruthy()
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('shows the generic properties of an unknown entity', () => {
    renderInspector({ entityType: 'mystery', label: 'X', extra: { a: 1 }, plain: 'v', nothing: null })
    expect(screen.getByText('{"a":1}')).toBeTruthy()
    expect(screen.getByText('plain')).toBeTruthy()
  })

  it('says when a generic entity has no property', () => {
    const store = createStore()
    store.set(intelligenceNodesAtom, [{ id: 'n1', type: 'custom', position: { x: 0, y: 0 }, data: { entityType: 'mystery', label: 'X', layer: 'code', entityId: 'e' } } as unknown as IntelligenceNode])
    store.set(selectedNodeIdAtom, 'n1')
    render(<Provider store={store}><NodeInspector /></Provider>)
    expect(screen.getByText('No additional properties')).toBeTruthy()
  })
})

describe('SkillContextCard', () => {
  it('renders the enriched skill and activates it', async () => {
    skillsApi.get.mockResolvedValue({
      id: 'ent-1',
      description: 'A skill about graphs',
      is_validated: true,
      coverage: 0.5,
      hit_rate: 0.25,
      activation_count: 7,
      tags: ['graph'],
      trigger_patterns: [{ pattern_type: 'regex', pattern_value: 'neo4j', confidence_threshold: 0.6 }],
    })
    skillsApi.getHealth.mockResolvedValue({ recommendation: 'at_risk', in_probation: true, probation_days_remaining: 3, explanation: 'Low hit rate' })
    skillsApi.getMembers.mockResolvedValue({
      notes: Array.from({ length: 9 }, (_, i) => note(`note-${i}`)),
      decisions: [{ id: 'd1', status: 'accepted', description: 'Pick Neo4j' }],
    })
    skillsApi.activate.mockResolvedValueOnce({ activated_notes: [1, 2], confidence: 0.9 })
    skillsApi.activate.mockRejectedValueOnce(new Error('boom'))
    skillsApi.activate.mockRejectedValueOnce('nope')

    renderInspector({ entityType: 'skill', label: 'Graphs', status: 'imported', energy: 0.4, cohesion: 0.3, noteCount: 2, activationCount: 1 })

    expect(await screen.findByText('A skill about graphs')).toBeTruthy()
    expect(screen.getByText('neo4j')).toBeTruthy()
    expect(screen.getByText('Low hit rate')).toBeTruthy()
    expect(screen.getByText('Pick Neo4j')).toBeTruthy()
    expect(screen.getByText('graph')).toBeTruthy()

    const button = screen.getByRole('button', { name: /activate/i })
    fireEvent.click(button)
    await waitFor(() => expect(skillsApi.activate).toHaveBeenCalledTimes(1))
    await screen.findByText(/90/)
    fireEvent.click(button)
    await screen.findByText(/boom/)
    fireEvent.click(button)
    await waitFor(() => expect(skillsApi.activate).toHaveBeenCalledTimes(3))
  })

  it('shows the empty member list when the APIs fail', async () => {
    skillsApi.get.mockRejectedValue(new Error('x'))
    skillsApi.getHealth.mockResolvedValue({ recommendation: 'something_else', in_probation: false })
    skillsApi.getMembers.mockRejectedValue(new Error('x'))
    renderInspector({ entityType: 'skill', label: 'Graphs', status: 'unknown', energy: 0.4, cohesion: 0.3, noteCount: 0, activationCount: 0 })
    await waitFor(() => expect(skillsApi.getMembers).toHaveBeenCalled())
    expect(await screen.findByText('unknown')).toBeTruthy()
  })
})

describe('NoteContextCard', () => {
  it('renders the note, its anchors and synapses, then confirms', async () => {
    notesApi.get.mockResolvedValue({
      ...note('ent-1'),
      content: 'Full note body',
      anchors: [
        { entity_type: 'file', entity_id: 'src/a.rs', is_valid: false },
        { entity_type: 'weird', entity_id: 'thing', is_valid: true },
      ],
    })
    notesApi.searchNeurons.mockResolvedValue({
      results: [
        { id: 'ent-1', content: 'self', note_type: 'tip', activation_score: 1 },
        { id: 'n2', content: 'neighbour', note_type: 'tip', activation_score: 0.5 },
        { id: 'n2', content: 'dup', note_type: 'tip', activation_score: 0.5 },
        { id: 'n3', content: 'other', note_type: 'odd', activation_score: 0.01 },
      ],
    })
    notesApi.confirm.mockResolvedValue({})
    renderInspector({ entityType: 'note', label: 'A note', noteType: 'gotcha', status: 'stale', importance: 'critical', energy: 0.5, staleness: 0.8 })
    expect(await screen.findByText('Full note body')).toBeTruthy()
    expect(screen.getByText('a.rs')).toBeTruthy()
    expect(screen.getByText('neighbour')).toBeTruthy()
    expect(screen.queryByText('self')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    await waitFor(() => expect(notesApi.confirm).toHaveBeenCalledWith('ent-1'))
  })

  it('invalidates, and reports a failed action', async () => {
    notesApi.get.mockRejectedValue(new Error('x'))
    notesApi.searchNeurons.mockResolvedValue({ results: [] })
    notesApi.invalidate.mockRejectedValueOnce(new Error('cannot'))
    notesApi.invalidate.mockResolvedValueOnce({})
    notesApi.confirm.mockRejectedValueOnce('no')
    renderInspector({ entityType: 'note', label: 'A note', noteType: 'mystery', status: 'odd', importance: 'odd', energy: 0.5, staleness: 0.5, tags: ['x'] })
    await waitFor(() => expect(notesApi.searchNeurons).toHaveBeenCalled())
    fireEvent.click(await screen.findByRole('button', { name: /confirm/i }))
    await waitFor(() => expect(notesApi.confirm).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: /invalidate/i }))
    expect(await screen.findByText('cannot')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /invalidate/i }))
    await waitFor(() => expect(notesApi.invalidate).toHaveBeenCalledTimes(2))
  })
})

describe('FileContextCard', () => {
  it('renders importance, symbols, notes and co-changers', async () => {
    codeApi.getNodeImportance.mockResolvedValue({
      risk_level: 'critical',
      summary: 'Central file',
      metrics: { pagerank: 0.4, betweenness: 0.2, in_degree: 3, out_degree: 4, clustering_coefficient: 0.5 },
      fabric_metrics: { fabric_pagerank: 0.3, fabric_community_id: 2 },
      percentiles: { pagerank_p80: 0.1, pagerank_p95: 0.3, betweenness_p80: 0.1, betweenness_p95: 0.5 },
    })
    codeApi.getFileSymbols.mockResolvedValue({
      functions: [
        { name: 'run', is_async: true, visibility: 'pub', line_start: 10 },
        { name: 'helper', visibility: 'private' },
      ],
    })
    notesApi.getEntityNotes.mockResolvedValue({ items: [note('fn1'), note('fn2', { note_type: 'odd', importance: 'odd', tags: [] })] })
    commitsApi.getFileCoChangers.mockResolvedValue({ items: [{ file_path: 'src/b.rs', co_change_count: 4 }, { file_path: 'c.rs', co_change_count: 1 }] })
    renderInspector({ entityType: 'file', label: 'a.rs', path: 'src/a.rs', language: 'rust' })
    expect(await screen.findByText('Central file')).toBeTruthy()
    expect(await screen.findByText('run')).toBeTruthy()
    expect(screen.getByText('content of fn1')).toBeTruthy()
    expect(screen.getByText('b.rs')).toBeTruthy()
  })

  it('shows the empty sections when nothing is known', async () => {
    codeApi.getNodeImportance.mockRejectedValue(new Error('x'))
    codeApi.getFileSymbols.mockResolvedValue({})
    notesApi.getEntityNotes.mockResolvedValue({})
    commitsApi.getFileCoChangers.mockResolvedValue({})
    renderInspector({ entityType: 'file', label: 'a.rs', communityId: 5, riskLevel: 'unknown' })
    await waitFor(() => expect(commitsApi.getFileCoChangers).toHaveBeenCalled())
    expect(await screen.findByText('unknown')).toBeTruthy()
  })
})

describe('ProtocolContextCard', () => {
  const detail = {
    id: 'ent-1',
    name: 'Deploy',
    description: 'Deploy protocol',
    project_id: 'p1',
    entry_state: 's1',
    terminal_states: ['s3'],
    protocol_category: 'system',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    states: [
      { id: 's1', protocol_id: 'ent-1', name: 'Start', description: 'begin', state_type: 'start', action: 'boot' },
      { id: 's2', protocol_id: 'ent-1', name: 'Mid', description: '', state_type: 'odd' },
      { id: 's3', protocol_id: 'ent-1', name: 'End', description: '', state_type: 'terminal' },
    ],
    transitions: [
      { id: 't1', protocol_id: 'ent-1', from_state: 's1', to_state: 's2', trigger: 'go', guard: 'ready' },
      { id: 't2', protocol_id: 'ent-1', from_state: 's2', to_state: 'zz', trigger: 'finish' },
    ],
  }

  it('renders states, transitions, the routing reason and the active run', async () => {
    intelligenceApi.getProtocol.mockResolvedValue(detail)
    intelligenceApi.listRuns.mockResolvedValue({
      items: [{ id: 'r1', protocol_id: 'ent-1', current_state: 's2', status: 'running', started_at: '2026-01-01T00:00:00Z', triggered_by: 'manual', states_visited: [{ state_id: 's1', state_name: 'Start', entered_at: '2026-01-01T00:00:00Z' }] }],
    })
    intelligenceApi.routeProtocols.mockResolvedValue({
      results: [{
        protocol_id: 'ent-1',
        protocol_name: 'Deploy',
        protocol_category: 'system',
        affinity: {
          score: 0.8,
          explanation: 'Good fit',
          dimensions: [
            { name: 'phase', context_value: 0.5, relevance_value: 0.6, weight: 1, contribution: 0.5 },
            { name: 'custom', context_value: 0.1, relevance_value: 0.9, weight: 1, contribution: 0.1 },
            { name: 'domain', context_value: 0.2, relevance_value: 0.7, weight: 1, contribution: 0.1 },
          ],
        },
        relevance_vector: { phase: 0.5, structure: 0.5, domain: 0.5, resource: 0.5, lifecycle: 0.5 },
      }],
    })
    renderInspector({ entityType: 'protocol', label: 'Deploy', category: 'business', skillId: 'skill-9' })
    expect(await screen.findByText('Deploy protocol')).toBeTruthy()
    expect(screen.getByText('skill-9')).toBeTruthy()
    expect(screen.getAllByText('[ready]').length).toBeGreaterThan(0)
    fireEvent.click(await screen.findByRole('button', { name: /why/i }))
    expect(screen.getByText('Good fit')).toBeTruthy()
    expect(screen.getAllByText('custom').length).toBeGreaterThan(0)
  })

  it('renders an empty protocol and survives a failed fetch', async () => {
    intelligenceApi.getProtocol.mockResolvedValueOnce({ ...detail, project_id: '', description: '', states: [], transitions: [] })
    intelligenceApi.listRuns.mockRejectedValue(new Error('x'))
    renderInspector({ entityType: 'protocol', label: 'Deploy', category: 'odd' })
    expect(await screen.findByText('odd')).toBeTruthy()
  })

  it('logs a fetch error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    intelligenceApi.getProtocol.mockRejectedValueOnce(new Error('down'))
    intelligenceApi.listRuns.mockResolvedValue(null)
    renderInspector({ entityType: 'protocol', label: 'Deploy', category: 'system' })
    await waitFor(() => expect(spy).toHaveBeenCalled())
    spy.mockRestore()
  })
})
