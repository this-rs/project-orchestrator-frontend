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
  EmbeddingsFile,
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

/** Hotspot paths for cross-referencing (optional enrichment) */
export interface CommunitiesEnrichment {
  hotspotPaths?: Set<string>;
}

export function communitiesToEmbeddings(
  communities: CodeCommunities,
  enrichment?: CommunitiesEnrichment,
): EmbeddingsData {
  const hotspotSet = enrichment?.hotspotPaths ?? new Set<string>();

  // Track all assigned files to compute orphans
  const assignedFiles = new Set<string>();

  const clusters: EmbeddingsData['clusters'] = communities.communities.map((c, i) => {
    const members = c.members ?? c.key_files ?? [];
    members.forEach((f) => assignedFiles.add(f));

    const files: EmbeddingsFile[] = members.map((filePath) => ({
      path: filePath,
      language: guessLanguage(filePath),
      isHotspot: hotspotSet.has(filePath),
    }));

    return {
      label: c.label || `Cluster ${c.id}`,
      count: c.size,
      color: COMMUNITY_COLORS[i % COMMUNITY_COLORS.length] as string,
      files,
    };
  });

  // Orphan files: total_files - assigned. We don't have individual orphan paths
  // from this endpoint, so we create a placeholder orphan cluster if count > 0.
  const orphanCount = Math.max(0, communities.total_files - assignedFiles.size);
  if (orphanCount > 0) {
    clusters.push({
      label: 'Orphans',
      count: orphanCount,
      color: '#64748b', // slate-500
      files: [], // no individual file data available for orphans
      isOrphan: true,
    });
  }

  return { clusters };
}

function guessLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    rs: 'Rust',
    ts: 'TypeScript',
    tsx: 'TypeScript',
    js: 'JavaScript',
    jsx: 'JavaScript',
    py: 'Python',
    go: 'Go',
    java: 'Java',
    rb: 'Ruby',
    css: 'CSS',
    html: 'HTML',
    yaml: 'YAML',
    yml: 'YAML',
    toml: 'TOML',
    json: 'JSON',
    md: 'Markdown',
    sql: 'SQL',
  };
  return map[ext] ?? ext.toUpperCase();
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
      metadata: { filePath: path, impactScore: 1 - i * 0.05, isDirect: true },
    }),
  );

  const transitiveTokens: AttentionToken[] =
    impact.transitive_dependents.map((path, i) => ({
      label: basename(path),
      score: 0.5 - i * 0.02, // transitive deps have lower score
      metadata: { filePath: path, impactScore: 0.5 - i * 0.02, isDirect: false },
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

/**
 * Merge impact analyses from multiple files into a single AttentionData.
 * Accepts either a single ImpactAnalysis or an array of them (from Promise.all).
 * Each affected file becomes a high-relevance particle; transitive deps are dimmed.
 * Deduplicates by full file path, keeping the highest score.
 */
export function mergedImpactToAttention(
  input: ImpactAnalysis | ImpactAnalysis[],
): AttentionData {
  // Single impact — delegate to original
  if (!Array.isArray(input)) {
    return impactToAttention(input);
  }

  const tokenMap = new Map<string, AttentionToken>();

  for (const impact of input) {
    // Direct dependents — high relevance
    for (let i = 0; i < impact.direct_dependents.length; i++) {
      const path = impact.direct_dependents[i];
      const score = 1 - i * 0.05;
      const existing = tokenMap.get(path);
      if (!existing || existing.score < score) {
        tokenMap.set(path, {
          label: basename(path),
          score,
          metadata: { filePath: path, impactScore: score, isDirect: true },
        });
      }
    }

    // Transitive dependents — lower relevance
    for (let i = 0; i < impact.transitive_dependents.length; i++) {
      const path = impact.transitive_dependents[i];
      const score = 0.5 - i * 0.02;
      const existing = tokenMap.get(path);
      if (!existing || existing.score < score) {
        tokenMap.set(path, {
          label: basename(path),
          score,
          metadata: { filePath: path, impactScore: score, isDirect: existing?.metadata?.isDirect ?? false },
        });
      }
    }
  }

  const relevantTokens = [...tokenMap.values()]
    .filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score);

  const totalCount = tokenMap.size;

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
    totalTasks += w.tasks.length;
    return {
      waveNumber: w.wave_number,
      agents: w.tasks.length,
      tasks: w.tasks.map((t) => ({
        title: t.title ?? t.id,
        id: t.id,
        status: t.status,
        affected_files: t.affected_files ?? [],
      })),
    };
  });

  return {
    waves: delegationWaves,
    totalTasks,
  };
}

// ── 5. Summary → Moat ───────────────────────────────────────

export function summaryToMoat(summary: IntelligenceSummary): MoatData {
  // Compute per-layer health (0-1)
  const codeHealth = summary.code.files > 0
    ? Math.min(1, 1 - summary.code.orphans / summary.code.files)
    : 0;

  const knowledgeHealth = summary.knowledge.notes > 0
    ? Math.min(1, 1 - summary.knowledge.stale_count / summary.knowledge.notes)
    : 0;

  const skillsHealth = summary.skills.total > 0
    ? Math.min(1, summary.skills.active / summary.skills.total)
    : 0;

  const behavioralHealth = summary.behavioral.protocols > 0
    ? Math.min(1, summary.behavioral.skill_linked / summary.behavioral.protocols)
    : 0;

  const fabricHealth = summary.fabric.co_changed_pairs > 0
    ? Math.min(1, summary.fabric.co_changed_pairs / 50) // normalize to ~50 pairs = healthy
    : 0;

  const neuralHealth = Math.min(1,
    ((1 - summary.neural.weak_synapses_ratio) + summary.neural.avg_energy) / 2,
  );

  const layers: MoatData['layers'] = [
    { name: 'code', count: summary.code.files, health: codeHealth },
    { name: 'knowledge', count: summary.knowledge.notes + summary.knowledge.decisions, health: knowledgeHealth },
    { name: 'skills', count: summary.skills.total, health: skillsHealth },
    { name: 'behavioral', count: summary.behavioral.protocols, health: behavioralHealth },
    { name: 'fabric', count: summary.fabric.co_changed_pairs, health: fabricHealth },
    { name: 'neural', count: summary.neural.active_synapses, health: neuralHealth },
  ].filter((l) => l.count > 0);

  // Global health = average of active layer healths
  const healthScore = layers.length > 0
    ? layers.reduce((sum, l) => sum + l.health, 0) / layers.length
    : 0;

  return { layers, healthScore };
}

// ── 6. Protocol Run → Feedback Loop ────────────────────────

export function runToFeedbackLoop(run: ProtocolRun): FeedbackLoopData {
  const visits = run.states_visited ?? [];

  return {
    iterations: visits.length,
    labels: visits.map((s) => s.state_name ?? s.state_id),
    steps: visits.map((s, i) => {
      // Compute duration_ms from entered_at / exited_at if available
      let duration_ms: number | undefined;
      if (s.entered_at && s.exited_at) {
        duration_ms = new Date(s.exited_at).getTime() - new Date(s.entered_at).getTime();
      }

      // Derive status: last visit without exit = running, with exit = completed
      // If the run itself failed and this is the last state, mark as failed
      let status: 'running' | 'completed' | 'failed' = 'completed';
      const isLast = i === visits.length - 1;
      if (isLast && run.status === 'failed') {
        status = 'failed';
      } else if (isLast && !s.exited_at && run.status === 'running') {
        status = 'running';
      }

      return {
        label: `v${i + 1}`,
        state: s.state_name ?? s.state_id,
        timestamp: s.entered_at,
        duration_ms,
        status,
        state_id: s.state_id,
      };
    }),
  };
}
