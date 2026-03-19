/**
 * Particle Viz — Data Adapters
 *
 * Transform PO API responses into scene-ready data shapes.
 * Pure functions, zero side-effects.
 */

import type { CodeCommunities } from '@/types';
import type { PropagatedNote } from '@/types';
import type { Wave } from '@/types';
import type { IntelligenceSummary } from '@/types/intelligence';
import type { ProtocolRun } from '@/types/protocol';
import type { ImpactAnalysis } from '@/services/code';
import type {
  EmbeddingsData,
  AttentionData,
  AttentionToken,
  DistributionData,
  DelegationData,
  MoatData,
  FeedbackLoopData,
} from './types';

export type { ImpactAnalysis } from '@/services/code';
export * from './types';

// ── Color palette for community clusters ────────────────────

const COMMUNITY_COLORS = [
  '#22d3ee', // cyan (accent)
  '#a78bfa', // violet
  '#f472b6', // pink
  '#34d399', // emerald
  '#fbbf24', // amber
  '#fb923c', // orange
  '#818cf8', // indigo
  '#e879f9', // fuchsia
] as const;

// ── 1. Communities → Embeddings ─────────────────────────────

export function communitiesToEmbeddings(
  communities: CodeCommunities,
): EmbeddingsData {
  return {
    clusters: communities.communities.map((c, i) => ({
      label: c.label || `Cluster ${c.id}`,
      count: c.size,
      color: COMMUNITY_COLORS[i % COMMUNITY_COLORS.length],
    })),
  };
}

// ── 2. Impact → Attention ───────────────────────────────────

function basename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

export function impactToAttention(impact: ImpactAnalysis): AttentionData {
  const directTokens: AttentionToken[] = impact.direct_dependents.map(
    (path, i) => ({
      label: basename(path),
      score: 1 - i * 0.05, // direct deps have highest score, decreasing
    }),
  );

  const transitiveTokens: AttentionToken[] =
    impact.transitive_dependents.map((path, i) => ({
      label: basename(path),
      score: 0.5 - i * 0.02, // transitive deps have lower score
    }));

  const relevantTokens = [...directTokens, ...transitiveTokens].filter(
    (t) => t.score > 0,
  );

  const totalCount =
    impact.direct_dependents.length + impact.transitive_dependents.length;

  return {
    totalTokens: totalCount,
    relevantTokens,
    ignoredCount: Math.max(0, totalCount - relevantTokens.length),
  };
}

// ── 3. Propagated Notes → Distribution ──────────────────────

function buildPropagationTree(
  propagated: PropagatedNote[],
): DistributionData['nodes'] {
  const nodes: DistributionData['nodes'] = [];
  const seen = new Set<string>();

  // Sort by distance to build tree in BFS order
  const sorted = [...propagated].sort(
    (a, b) => (a.distance ?? 0) - (b.distance ?? 0),
  );

  for (const note of sorted) {
    if (seen.has(note.id)) continue;
    seen.add(note.id);

    // Parse propagation_path to determine parent
    // Format: "entity → note_1 → note_2" or undefined
    let parent: string | undefined;
    if (note.propagation_path) {
      const parts = note.propagation_path.split(' → ');
      if (parts.length >= 2) {
        const parentLabel = parts[parts.length - 2];
        const parentNote = propagated.find(
          (p) => p.id !== note.id && p.content?.startsWith(parentLabel),
        );
        parent = parentNote?.id;
      }
    }

    const label =
      note.content?.slice(0, 40) || note.note_type || `Note ${note.id.slice(0, 8)}`;

    nodes.push({
      id: note.id,
      label: label.length >= 40 ? `${label}...` : label,
      parent,
      depth: note.distance ?? 0,
      score: note.relevance_score,
    });
  }

  return nodes;
}

export function propagatedToDistribution(
  propagated: PropagatedNote[],
): DistributionData {
  return {
    nodes: buildPropagationTree(propagated),
    maxReach: propagated.length,
  };
}

// ── 4. Waves → Delegation ───────────────────────────────────

export function wavesToDelegation(waves: Wave[]): DelegationData {
  let totalTasks = 0;

  const delegationWaves = waves.map((w) => {
    const tasks = w.tasks.map((t) => t.title ?? t.id);
    totalTasks += w.tasks.length;
    return {
      agents: w.tasks.length,
      tasks,
    };
  });

  return {
    waves: delegationWaves,
    totalTasks,
  };
}

// ── 5. Summary → Moat ───────────────────────────────────────

export function summaryToMoat(summary: IntelligenceSummary): MoatData {
  return {
    layers: [
      { name: 'code', count: summary.code.files },
      { name: 'knowledge', count: summary.knowledge.notes + summary.knowledge.decisions },
      { name: 'skills', count: summary.skills.total },
      { name: 'behavioral', count: summary.behavioral.protocols },
      { name: 'fabric', count: summary.fabric.co_changed_pairs },
      { name: 'neural', count: summary.neural.active_synapses },
    ].filter((l) => l.count > 0),
  };
}

// ── 6. Protocol Run → Feedback Loop ────────────────────────

export function runToFeedbackLoop(run: ProtocolRun): FeedbackLoopData {
  const visits = run.states_visited ?? [];

  return {
    iterations: visits.length,
    labels: visits.map((s) => s.state_name ?? s.state_id),
    steps: visits.map((s, i) => ({
      label: `v${i + 1}`,
      state: s.state_name ?? s.state_id,
      timestamp: s.entered_at,
    })),
  };
}
