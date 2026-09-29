import { describe, it, expect } from 'vitest'
import { buildArchitecture, groupByTier, normalizeComponentType } from '../architecture'
import type { TopologyResponse } from '@/services/workspaces'

const comp = (id: string, type: string, deps: string[] = []) => ({
  component: {
    id,
    workspace_id: 'w',
    name: id,
    component_type: type,
    created_at: '',
    tags: [],
  },
  project_name: null,
  dependencies: deps.map((to) => ({ to_id: to, protocol: 'http', required: true })),
})

describe('normalizeComponentType', () => {
  it('accepts the backend PascalCase and the app snake_case', () => {
    expect(normalizeComponentType('MessageQueue')).toBe('message_queue')
    expect(normalizeComponentType('message_queue')).toBe('message_queue')
    expect(normalizeComponentType('Database')).toBe('database')
  })
  it('falls back to other', () => {
    expect(normalizeComponentType('Lambda')).toBe('other')
    expect(normalizeComponentType(undefined)).toBe('other')
  })
})

describe('buildArchitecture', () => {
  const topo: TopologyResponse = {
    components: [comp('web', 'Frontend', ['api']), comp('api', 'Service', ['db', 'ghost']), comp('db', 'Database')],
  }

  it('lays nodes out left to right following dependencies', () => {
    const { nodes } = buildArchitecture(topo)
    const x = Object.fromEntries(nodes.map((n) => [n.id, n.x]))
    expect(x.web).toBeLessThan(x.api)
    expect(x.api).toBeLessThan(x.db)
  })

  it('drops edges to unknown components', () => {
    const { edges } = buildArchitecture(topo)
    expect(edges.map((e) => e.id).sort()).toEqual(['api->db', 'web->api'])
  })

  it('handles an empty topology', () => {
    expect(buildArchitecture(null)).toEqual({ nodes: [], edges: [] })
  })

  it('groups by tier, edge first', () => {
    const groups = groupByTier(buildArchitecture(topo).nodes)
    expect(groups.map((g) => g.nodes[0].id)).toEqual(['web', 'api', 'db'])
  })
})
