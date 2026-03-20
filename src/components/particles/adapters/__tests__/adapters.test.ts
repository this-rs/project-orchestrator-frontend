/**
 * Adapter tests — verify PO API → scene data transformations.
 */
import { describe, it, expect } from 'vitest';
import {
  communitiesToEmbeddings,
  impactToAttention,
  propagatedToDistribution,
  wavesToDelegation,
  summaryToMoat,
  runToFeedbackLoop,
} from '../index';
import type { CodeCommunities, Wave, PropagatedNote } from '@/types';
import type { ImpactAnalysis } from '@/services/code';
import type { IntelligenceSummary } from '@/types/intelligence';
import type { ProtocolRun } from '@/types/protocol';

// ── 1. communitiesToEmbeddings ──────────────────────────────

describe('communitiesToEmbeddings', () => {
  const mockCommunities: CodeCommunities = {
    communities: [
      { id: '1', label: 'Core', size: 24, key_files: ['a.ts', 'b.ts'] },
      { id: '2', label: 'API', size: 18, key_files: ['c.ts'] },
      { id: '3', label: '', size: 5, key_files: [] },
    ],
    total_files: 47,
    community_count: 3,
  };

  it('maps each community to a cluster with label, count, color', () => {
    const result = communitiesToEmbeddings(mockCommunities);

    expect(result.clusters).toHaveLength(3);
    expect(result.clusters[0]).toEqual({
      label: 'Core',
      count: 24,
      color: '#22d3ee',
    });
    expect(result.clusters[1]).toEqual({
      label: 'API',
      count: 18,
      color: '#a78bfa',
    });
  });

  it('falls back to "Cluster <id>" when label is empty', () => {
    const result = communitiesToEmbeddings(mockCommunities);
    expect(result.clusters[2].label).toBe('Cluster 3');
  });

  it('cycles colors for > 8 communities', () => {
    const many: CodeCommunities = {
      communities: Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        label: `C${i}`,
        size: i + 1,
        key_files: [],
      })),
      total_files: 55,
      community_count: 10,
    };
    const result = communitiesToEmbeddings(many);
    expect(result.clusters[8].color).toBe(result.clusters[0].color);
  });

  it('returns empty clusters for empty communities', () => {
    const empty: CodeCommunities = {
      communities: [],
      total_files: 0,
      community_count: 0,
    };
    expect(communitiesToEmbeddings(empty).clusters).toEqual([]);
  });
});

// ── 2. impactToAttention ────────────────────────────────────

describe('impactToAttention', () => {
  const mockImpact: ImpactAnalysis = {
    direct_dependents: ['src/core/engine.ts', 'src/core/pool.ts'],
    transitive_dependents: ['src/ui/app.ts', 'src/ui/page.ts'],
    affected_tests: ['test/engine.test.ts'],
    risk_score: 0.7,
  };

  it('maps direct dependents with decreasing scores starting at 1', () => {
    const result = impactToAttention(mockImpact);
    expect(result.relevantTokens[0]).toEqual({
      label: 'engine.ts',
      score: 1,
    });
    expect(result.relevantTokens[1]).toEqual({
      label: 'pool.ts',
      score: 0.95,
    });
  });

  it('maps transitive dependents with lower scores starting at 0.5', () => {
    const result = impactToAttention(mockImpact);
    expect(result.relevantTokens[2]).toEqual({
      label: 'app.ts',
      score: 0.5,
    });
    expect(result.relevantTokens[3]).toEqual({
      label: 'page.ts',
      score: 0.48,
    });
  });

  it('extracts basename from paths', () => {
    const result = impactToAttention(mockImpact);
    expect(result.relevantTokens.every((t) => !t.label.includes('/'))).toBe(
      true,
    );
  });

  it('filters out tokens with score <= 0', () => {
    const bigImpact: ImpactAnalysis = {
      direct_dependents: Array.from({ length: 30 }, (_, i) => `f${i}.ts`),
      transitive_dependents: Array.from(
        { length: 30 },
        (_, i) => `t${i}.ts`,
      ),
      affected_tests: [],
      risk_score: 0.9,
    };
    const result = impactToAttention(bigImpact);
    expect(result.relevantTokens.every((t) => t.score > 0)).toBe(true);
    expect(result.ignoredCount).toBeGreaterThan(0);
  });

  it('computes totalTokens and ignoredCount correctly', () => {
    const result = impactToAttention(mockImpact);
    expect(result.totalTokens).toBe(4);
    expect(result.ignoredCount).toBe(
      result.totalTokens - result.relevantTokens.length,
    );
  });

  it('handles empty impact', () => {
    const empty: ImpactAnalysis = {
      direct_dependents: [],
      transitive_dependents: [],
      affected_tests: [],
      risk_score: 0,
    };
    const result = impactToAttention(empty);
    expect(result.totalTokens).toBe(0);
    expect(result.relevantTokens).toEqual([]);
    expect(result.ignoredCount).toBe(0);
  });
});

// ── 3. propagatedToDistribution ─────────────────────────────

describe('propagatedToDistribution', () => {
  function mockNote(overrides: Partial<PropagatedNote> & Pick<PropagatedNote, 'id' | 'relevance_score'>): PropagatedNote {
    return {
      content: '',
      note_type: 'context',
      status: 'active',
      importance: 'medium',
      scope: undefined,
      tags: [],
      anchors: [],
      project_id: 'p1',
      created_at: '2026-01-01',
      created_by: 'agent',
      staleness_score: 0,
      relevance_score: 0,
      ...overrides,
    } as PropagatedNote;
  }

  const mockPropagated: PropagatedNote[] = [
    mockNote({
      id: 'root-1',
      content: 'Architecture Pattern for services',
      note_type: 'pattern',
      relevance_score: 1.0,
      distance: 0,
    }),
    mockNote({
      id: 'child-1',
      content: 'Service Layer notes here',
      note_type: 'guideline',
      relevance_score: 0.8,
      distance: 1,
      propagation_path: 'Architecture Pattern → Service Layer notes here',
    }),
  ];

  it('creates nodes sorted by distance', () => {
    const result = propagatedToDistribution(mockPropagated);
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].depth).toBe(0);
    expect(result.nodes[1].depth).toBe(1);
  });

  it('sets maxReach to propagated array length', () => {
    const result = propagatedToDistribution(mockPropagated);
    expect(result.maxReach).toBe(2);
  });

  it('truncates long labels at 40 chars', () => {
    const long: PropagatedNote[] = [
      mockNote({
        id: 'long-1',
        content: 'This is a very long note content that exceeds forty characters limit',
        relevance_score: 0.5,
        distance: 0,
      }),
    ];
    const result = propagatedToDistribution(long);
    expect(result.nodes[0].label).toMatch(/\.\.\.$/);
    expect(result.nodes[0].label.length).toBeLessThanOrEqual(43); // 40 + "..."
  });

  it('deduplicates nodes with same id', () => {
    const dupes: PropagatedNote[] = [
      mockNote({ id: 'dup', content: 'Same', relevance_score: 1, distance: 0 }),
      mockNote({ id: 'dup', content: 'Same', relevance_score: 0.8, distance: 1 }),
    ];
    const result = propagatedToDistribution(dupes);
    expect(result.nodes).toHaveLength(1);
  });

  it('handles empty array', () => {
    const result = propagatedToDistribution([]);
    expect(result.nodes).toEqual([]);
    expect(result.maxReach).toBe(0);
  });
});

// ── 4. wavesToDelegation ────────────────────────────────────

describe('wavesToDelegation', () => {
  const mockWaves: Wave[] = [
    {
      wave_number: 1,
      tasks: [
        {
          id: 't1',
          title: 'Setup DB',
          status: 'pending',
          priority: 1,
          affected_files: [],
          depends_on: [],
        },
        {
          id: 't2',
          title: 'Init config',
          status: 'pending',
          priority: 2,
          affected_files: [],
          depends_on: [],
        },
      ],
      task_count: 2,
      split_from_conflicts: false,
    },
    {
      wave_number: 2,
      tasks: [
        {
          id: 't3',
          status: 'in_progress',
          affected_files: ['a.ts'],
          depends_on: ['t1'],
        },
      ],
      task_count: 1,
      split_from_conflicts: false,
    },
  ];

  it('maps each wave to agents count and enriched task list', () => {
    const result = wavesToDelegation(mockWaves);
    expect(result.waves).toHaveLength(2);
    expect(result.waves[0].agents).toBe(2);
    expect(result.waves[0].waveNumber).toBe(1);
    expect(result.waves[0].tasks[0]).toEqual({
      title: 'Setup DB',
      id: 't1',
      status: 'pending',
      affected_files: [],
    });
    expect(result.waves[0].tasks[1]).toEqual({
      title: 'Init config',
      id: 't2',
      status: 'pending',
      affected_files: [],
    });
  });

  it('falls back to task id when title is missing', () => {
    const result = wavesToDelegation(mockWaves);
    expect(result.waves[1].tasks[0].title).toBe('t3');
    expect(result.waves[1].tasks[0].id).toBe('t3');
    expect(result.waves[1].tasks[0].status).toBe('in_progress');
    expect(result.waves[1].tasks[0].affected_files).toEqual(['a.ts']);
  });

  it('computes totalTasks correctly', () => {
    const result = wavesToDelegation(mockWaves);
    expect(result.totalTasks).toBe(3);
  });

  it('handles empty waves', () => {
    const result = wavesToDelegation([]);
    expect(result.waves).toEqual([]);
    expect(result.totalTasks).toBe(0);
  });
});

// ── 5. summaryToMoat ───────────────────────────────────────

describe('summaryToMoat', () => {
  const mockSummary: IntelligenceSummary = {
    code: {
      files: 156,
      functions: 420,
      communities: 8,
      hotspots: [{ path: 'main.ts', churn_score: 0.9 }],
      orphans: 3,
    },
    knowledge: {
      notes: 30,
      decisions: 12,
      stale_count: 2,
      types_distribution: { pattern: 5, guideline: 3 },
    },
    skills: {
      total: 8,
      active: 6,
      emerging: 2,
      avg_cohesion: 0.7,
      total_activations: 100,
    },
    behavioral: {
      protocols: 5,
      states: 20,
      transitions: 15,
      system_protocols: 3,
      business_protocols: 2,
      skill_linked: 4,
    },
    fabric: {
      co_changed_pairs: 234,
    },
    neural: {
      active_synapses: 100,
      avg_energy: 0.6,
      weak_synapses_ratio: 0.1,
      dead_notes_count: 3,
    },
  };

  it('creates layers from non-zero counts with health scores', () => {
    const result = summaryToMoat(mockSummary);
    expect(result.layers.length).toBeGreaterThan(0);
    expect(result.layers.every((l) => l.count > 0)).toBe(true);
    expect(result.layers.every((l) => typeof l.health === 'number' && l.health >= 0 && l.health <= 1)).toBe(true);
  });

  it('computes global healthScore as average of layer healths', () => {
    const result = summaryToMoat(mockSummary);
    expect(typeof result.healthScore).toBe('number');
    expect(result.healthScore).toBeGreaterThan(0);
    expect(result.healthScore).toBeLessThanOrEqual(1);
    // Verify it's the mean of layer healths
    const expectedAvg = result.layers.reduce((s, l) => s + l.health, 0) / result.layers.length;
    expect(result.healthScore).toBeCloseTo(expectedAvg, 5);
  });

  it('maps knowledge as notes + decisions', () => {
    const result = summaryToMoat(mockSummary);
    const knowledge = result.layers.find((l) => l.name === 'knowledge');
    expect(knowledge?.count).toBe(42); // 30 + 12
  });

  it('computes code health from orphan ratio', () => {
    const result = summaryToMoat(mockSummary);
    const code = result.layers.find((l) => l.name === 'code');
    // 3 orphans out of 156 files → health ≈ 0.98
    expect(code?.health).toBeGreaterThan(0.95);
  });

  it('computes knowledge health from stale ratio', () => {
    const result = summaryToMoat(mockSummary);
    const knowledge = result.layers.find((l) => l.name === 'knowledge');
    // 2 stale out of 30 notes → health ≈ 0.93
    expect(knowledge?.health).toBeGreaterThan(0.9);
  });

  it('filters out zero-count layers', () => {
    const sparse: IntelligenceSummary = {
      ...mockSummary,
      skills: { total: 0, active: 0, emerging: 0, avg_cohesion: 0, total_activations: 0 },
    };
    const result = summaryToMoat(sparse);
    expect(result.layers.find((l) => l.name === 'skills')).toBeUndefined();
  });

  it('produces expected layer names', () => {
    const result = summaryToMoat(mockSummary);
    const names = result.layers.map((l) => l.name);
    expect(names).toContain('code');
    expect(names).toContain('knowledge');
    expect(names).toContain('neural');
  });
});

// ── 6. runToFeedbackLoop ────────────────────────────────────

describe('runToFeedbackLoop', () => {
  const mockRun: ProtocolRun = {
    id: 'run-1',
    protocol_id: 'proto-1',
    current_state: 's3',
    current_state_name: 'approved',
    status: 'completed',
    states_visited: [
      {
        state_id: 's1',
        state_name: 'draft',
        entered_at: '2026-03-01T10:00:00Z',
      },
      {
        state_id: 's2',
        state_name: 'review',
        entered_at: '2026-03-02T14:00:00Z',
      },
      {
        state_id: 's3',
        state_name: 'approved',
        entered_at: '2026-03-03T09:00:00Z',
      },
    ],
    started_at: '2026-03-01T10:00:00Z',
  };

  it('maps states_visited to iterations count', () => {
    const result = runToFeedbackLoop(mockRun);
    expect(result.iterations).toBe(3);
  });

  it('extracts labels from state names', () => {
    const result = runToFeedbackLoop(mockRun);
    expect(result.labels).toEqual(['draft', 'review', 'approved']);
  });

  it('creates steps with v-prefixed labels and enriched fields', () => {
    const result = runToFeedbackLoop(mockRun);
    expect(result.steps[0]).toEqual({
      label: 'v1',
      state: 'draft',
      timestamp: '2026-03-01T10:00:00Z',
      duration_ms: undefined,
      status: 'completed',
      state_id: 's1',
    });
    expect(result.steps[2].label).toBe('v3');
    // Last state of a completed run should also be 'completed'
    expect(result.steps[2].status).toBe('completed');
  });

  it('marks last state as failed when run status is failed', () => {
    const failedRun: ProtocolRun = {
      ...mockRun,
      status: 'failed',
    };
    const result = runToFeedbackLoop(failedRun);
    expect(result.steps[2].status).toBe('failed');
    expect(result.steps[0].status).toBe('completed');
  });

  it('marks last state as running when run is running and no exit', () => {
    const runningRun: ProtocolRun = {
      ...mockRun,
      status: 'running',
      states_visited: [
        { state_id: 's1', state_name: 'draft', entered_at: '2026-03-01T10:00:00Z', exited_at: '2026-03-01T11:00:00Z' },
        { state_id: 's2', state_name: 'review', entered_at: '2026-03-01T11:00:00Z' },
      ],
    };
    const result = runToFeedbackLoop(runningRun);
    expect(result.steps[1].status).toBe('running');
    expect(result.steps[0].status).toBe('completed');
    expect(result.steps[0].duration_ms).toBe(3600000); // 1 hour
  });

  it('falls back to state_id when state_name is missing', () => {
    const noNames: ProtocolRun = {
      ...mockRun,
      states_visited: [
        { state_id: 'sid-1', state_name: undefined, entered_at: '2026-03-01T10:00:00Z' },
      ],
    };
    const result = runToFeedbackLoop(noNames);
    expect(result.labels[0]).toBe('sid-1');
    expect(result.steps[0].state).toBe('sid-1');
    expect(result.steps[0].state_id).toBe('sid-1');
  });

  it('handles undefined states_visited', () => {
    const noVisits: ProtocolRun = {
      ...mockRun,
      states_visited: undefined,
    };
    const result = runToFeedbackLoop(noVisits);
    expect(result.iterations).toBe(0);
    expect(result.labels).toEqual([]);
    expect(result.steps).toEqual([]);
  });
});
