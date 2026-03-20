/**
 * Particle Viz — Data Hooks
 *
 * Each hook fetches PO API data and transforms it via adapters.
 * Returns { data, isLoading, error } with fallback mock data when API is down.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { codeApi } from '@/services/code';
import { notesApi } from '@/services/notes';
import { plansApi } from '@/services/plans';
import { intelligenceApi } from '@/services/intelligence';
import { protocolApi } from '@/services/protocolApi';
import {
  communitiesToEmbeddings,
  mergedImpactToAttention,
  propagatedToDistribution,
  wavesToDelegation,
  summaryToMoat,
  runToFeedbackLoop,
} from '@/components/particles/adapters';
import type { CommunitiesEnrichment } from '@/components/particles/adapters';
import type {
  EmbeddingsData,
  AttentionData,
  DistributionData,
  DelegationData,
  MoatData,
  FeedbackLoopData,
} from '@/components/particles/adapters';

// ── Shared hook result type ─────────────────────────────────

interface VizDataResult<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
}

// ── Generic fetcher ─────────────────────────────────────────

function useVizFetch<TRaw, TOut>(
  fetcher: (() => Promise<TRaw>) | null,
  adapter: (raw: TRaw) => TOut,
  fallback: TOut,
): VizDataResult<TOut> {
  const [data, setData] = useState<TOut | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!fetcher) {
      setData(null);
      setIsLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    fetcher()
      .then((raw) => {
        if (controller.signal.aborted) return;
        setData(adapter(raw));
        setIsLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.warn('[useVizData] API error, using fallback:', err);
        setData(fallback);
        setError(err?.message ?? 'API unavailable');
        setIsLoading(false);
      });

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher]);

  return { data, isLoading, error };
}

// ── Mock data (fallbacks when API is down) ──────────────────

const MOCK_EMBEDDINGS: EmbeddingsData = {
  clusters: [
    { label: 'Core Engine', count: 24, color: '#22d3ee', files: [
      { path: 'src/engine/core.rs', language: 'Rust', isHotspot: true },
      { path: 'src/engine/pool.rs', language: 'Rust', isHotspot: false },
    ] },
    { label: 'API Layer', count: 18, color: '#a78bfa', files: [
      { path: 'src/api/routes.rs', language: 'Rust', isHotspot: false },
    ] },
    { label: 'UI Components', count: 31, color: '#f472b6', files: [
      { path: 'src/components/App.tsx', language: 'TypeScript', isHotspot: true },
    ] },
    { label: 'Data Models', count: 12, color: '#34d399', files: [] },
  ],
};

const MOCK_ATTENTION: AttentionData = {
  totalTokens: 42,
  relevantTokens: [
    { label: 'index.ts', score: 0.95 },
    { label: 'api.ts', score: 0.82 },
    { label: 'types.ts', score: 0.71 },
    { label: 'utils.ts', score: 0.45 },
  ],
  ignoredCount: 38,
};

const MOCK_DISTRIBUTION: DistributionData = {
  nodes: [
    { id: 'root', label: 'Architecture Pattern', depth: 0, score: 1.0 },
    { id: 'n1', label: 'Service Layer', depth: 1, score: 0.8, parent: 'root' },
    { id: 'n2', label: 'Component Struct...', depth: 1, score: 0.6, parent: 'root' },
    { id: 'n3', label: 'API Contract', depth: 2, score: 0.4, parent: 'n1' },
  ],
  maxReach: 4,
};

const MOCK_DELEGATION: DelegationData = {
  waves: [
    {
      waveNumber: 1,
      agents: 2,
      tasks: [
        { title: 'Setup database', id: 'mock-t1', status: 'completed', affected_files: [] },
        { title: 'Init config', id: 'mock-t2', status: 'completed', affected_files: [] },
      ],
    },
    {
      waveNumber: 2,
      agents: 3,
      tasks: [
        { title: 'Build API', id: 'mock-t3', status: 'in_progress', affected_files: ['api.ts'] },
        { title: 'Build UI', id: 'mock-t4', status: 'pending', affected_files: ['ui.tsx'] },
        { title: 'Write tests', id: 'mock-t5', status: 'pending', affected_files: [] },
      ],
    },
    {
      waveNumber: 3,
      agents: 1,
      tasks: [
        { title: 'Integration test', id: 'mock-t6', status: 'pending', affected_files: [] },
      ],
    },
  ],
  totalTasks: 6,
};

const MOCK_MOAT: MoatData = {
  layers: [
    { name: 'code', count: 156, health: 0.85 },
    { name: 'knowledge', count: 42, health: 0.72 },
    { name: 'skills', count: 8, health: 0.60 },
    { name: 'behavioral', count: 5, health: 0.45 },
    { name: 'neural', count: 234, health: 0.78 },
  ],
  healthScore: 0.68,
};

const MOCK_FEEDBACK: FeedbackLoopData = {
  iterations: 3,
  labels: ['draft', 'review', 'approved'],
  steps: [
    { label: 'v1', state: 'draft', timestamp: '2026-03-01T10:00:00Z' },
    { label: 'v2', state: 'review', timestamp: '2026-03-02T14:00:00Z' },
    { label: 'v3', state: 'approved', timestamp: '2026-03-03T09:00:00Z' },
  ],
};

// ── 1. Embeddings ───────────────────────────────────────────

export function useEmbeddingsVizData(
  projectSlug: string | undefined,
  enrichment?: CommunitiesEnrichment,
): VizDataResult<EmbeddingsData> {
  const [fetcher, setFetcher] = useState<(() => Promise<ReturnType<typeof codeApi.getCommunities> extends Promise<infer R> ? R : never>) | null>(null);

  // Stable ref to enrichment to avoid re-triggering adapter on every render
  const enrichmentRef = useRef(enrichment);
  enrichmentRef.current = enrichment;

  useEffect(() => {
    if (!projectSlug) {
      setFetcher(null);
      return;
    }
    setFetcher(() => () => codeApi.getCommunities({ project_slug: projectSlug }));
  }, [projectSlug]);

  return useVizFetch(
    fetcher,
    (raw) => communitiesToEmbeddings(raw, enrichmentRef.current),
    MOCK_EMBEDDINGS,
  );
}

// ── 2. Attention ────────────────────────────────────────────

export function useAttentionVizData(
  target: string | string[] | undefined,
): VizDataResult<AttentionData> {
  const [fetcher, setFetcher] = useState<(() => Promise<Awaited<ReturnType<typeof codeApi.analyzeImpact>> | Awaited<ReturnType<typeof codeApi.analyzeImpact>>[]>) | null>(null);

  // Stable key for array targets to avoid infinite re-renders
  const targetKey = Array.isArray(target) ? target.join('\0') : target;

  useEffect(() => {
    if (!target || (Array.isArray(target) && target.length === 0)) {
      setFetcher(null);
      return;
    }

    if (Array.isArray(target)) {
      // Fetch impact for ALL files, return array of results
      setFetcher(() => () => Promise.all(target.map((t) => codeApi.analyzeImpact(t))));
    } else {
      setFetcher(() => () => codeApi.analyzeImpact(target));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);

  return useVizFetch(fetcher, mergedImpactToAttention, MOCK_ATTENTION);
}

// ── 3. Distribution ─────────────────────────────────────────

export function useDistributionVizData(
  entityType: string | undefined,
  entityId: string | undefined,
): VizDataResult<DistributionData> {
  const [fetcher, setFetcher] = useState<(() => Promise<Awaited<ReturnType<typeof notesApi.getPropagatedNotes>>>) | null>(null);

  useEffect(() => {
    if (!entityType || !entityId) {
      setFetcher(null);
      return;
    }
    setFetcher(
      () => () =>
        notesApi.getPropagatedNotes({
          entity_type: entityType,
          entity_id: entityId,
        }),
    );
  }, [entityType, entityId]);

  return useVizFetch(
    fetcher,
    (result) => propagatedToDistribution(result.items),
    MOCK_DISTRIBUTION,
  );
}

// ── 4. Delegation ───────────────────────────────────────────

export function useDelegationVizData(
  planId: string | undefined,
  /** When true, re-fetches waves every 10s for live updates */
  livePolling: boolean = false,
): VizDataResult<DelegationData> {
  const [fetcher, setFetcher] = useState<(() => Promise<Awaited<ReturnType<typeof plansApi.getWaves>>>) | null>(null);
  // Poll tick — incremented every 10s when live polling is active
  const [pollTick, setPollTick] = useState(0);

  // Stable refetch function that creates a new fetcher reference to trigger useVizFetch
  const triggerRefetch = useCallback(() => {
    if (!planId) return;
    // Create a NEW function reference to trigger the useEffect in useVizFetch
    setFetcher(() => () => plansApi.getWaves(planId));
  }, [planId]);

  useEffect(() => {
    if (!planId) {
      setFetcher(null);
      return;
    }
    setFetcher(() => () => plansApi.getWaves(planId));
  }, [planId]);

  // Live polling: refetch every 10s when active
  useEffect(() => {
    if (!livePolling || !planId) return;
    const interval = setInterval(() => {
      setPollTick((t) => t + 1);
    }, 10_000);
    return () => clearInterval(interval);
  }, [livePolling, planId]);

  // Trigger refetch on poll tick change
  useEffect(() => {
    if (pollTick > 0) triggerRefetch();
  }, [pollTick, triggerRefetch]);

  return useVizFetch(
    fetcher,
    (result) => wavesToDelegation(result.waves),
    MOCK_DELEGATION,
  );
}

// ── 5. Moat ─────────────────────────────────────────────────

export function useMoatVizData(
  projectSlug: string | undefined,
): VizDataResult<MoatData> {
  const [fetcher, setFetcher] = useState<(() => Promise<Awaited<ReturnType<typeof intelligenceApi.getSummary>>>) | null>(null);

  useEffect(() => {
    if (!projectSlug) {
      setFetcher(null);
      return;
    }
    setFetcher(() => () => intelligenceApi.getSummary(projectSlug));
  }, [projectSlug]);

  return useVizFetch(fetcher, summaryToMoat, MOCK_MOAT);
}

// ── 6. Feedback Loop ────────────────────────────────────────

export function useFeedbackVizData(
  runId: string | undefined,
): VizDataResult<FeedbackLoopData> {
  const [fetcher, setFetcher] = useState<(() => Promise<Awaited<ReturnType<typeof protocolApi.getRun>>>) | null>(null);

  useEffect(() => {
    if (!runId) {
      setFetcher(null);
      return;
    }
    setFetcher(() => () => protocolApi.getRun(runId));
  }, [runId]);

  return useVizFetch(fetcher, runToFeedbackLoop, MOCK_FEEDBACK);
}
