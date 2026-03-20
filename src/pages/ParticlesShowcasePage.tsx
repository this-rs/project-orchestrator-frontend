/**
 * ParticlesShowcasePage — /particles
 *
 * Grid of all 14 particle scenes with:
 * - Project selector to wire 6 data-driven scenes to real data
 * - 2-column responsive grid, each scene in 16:9
 * - Title + description under each card
 * - LIVE DATA / DEMO badge on each card
 * - Click → fullscreen overlay with pure black background
 * - Slideshow mode: arrow keys to navigate, pagination "N/14"
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ParticleViz } from '@/components/particles/ParticleViz';
import { Select } from '@/components/ui';
import { workspacesApi } from '@/services';
import { useWorkspaceSlug } from '@/hooks';
import {
  useEmbeddingsVizData,
  useAttentionVizData,
  useDistributionVizData,
  useDelegationVizData,
  useMoatVizData,
  useFeedbackVizData,
} from '@/hooks/useVizData';

// ── Scene Catalog ──────────────────────────────────────────

type SceneMode = 'data' | 'conceptual';

interface SceneEntry {
  key: string;
  title: string;
  description: string;
  mode: SceneMode;
}

const SCENES: SceneEntry[] = [
  { key: 'leverage', title: 'Leverage', description: 'One input amplifies into many outputs', mode: 'conceptual' },
  { key: 'system', title: 'System', description: 'Interconnected nodes forming a network', mode: 'conceptual' },
  {
    key: 'context-window',
    title: 'Context Window',
    description: 'Bounded capacity filling with tokens',
    mode: 'conceptual',
  },
  { key: 'focus', title: 'Focus', description: 'Particles converge toward a bright center', mode: 'conceptual' },
  {
    key: 'prompt-output',
    title: 'Prompt \u2192 Output',
    description: 'Input tokens transform into output',
    mode: 'conceptual',
  },
  { key: 'human-ai', title: 'Human + AI', description: 'Two orbital systems interacting', mode: 'conceptual' },
  { key: 'delegation', title: 'Delegation', description: 'Dispatcher sends waves to agents', mode: 'data' },
  { key: 'embeddings', title: 'Embeddings', description: 'Clustered particles in vector space', mode: 'data' },
  { key: 'attention', title: 'Attention', description: 'Spotlight reveals relevant particles', mode: 'data' },
  {
    key: 'fine-tuning',
    title: 'Fine-tuning',
    description: 'Chaos gradually organizes into order',
    mode: 'conceptual',
  },
  {
    key: 'signal-noise',
    title: 'Signal / Noise',
    description: 'Bright signals emerge from noise',
    mode: 'conceptual',
  },
  {
    key: 'distribution',
    title: 'Distribution',
    description: 'Information ripples outward from source',
    mode: 'data',
  },
  {
    key: 'feedback-loop',
    title: 'Feedback Loop',
    description: 'Particles circulate through stations',
    mode: 'data',
  },
  { key: 'moat', title: 'Moat', description: 'Concentric defensive layers orbiting core', mode: 'data' },
];

const DATA_SCENE_KEYS = new Set(
  SCENES.filter((s) => s.mode === 'data').map((s) => s.key),
);

// ── Badge Component ────────────────────────────────────────

function DataBadge({ live, fallbackMessage }: { live: boolean; fallbackMessage?: string }) {
  const label = live ? 'LIVE DATA' : 'DEMO';
  const bg = live ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.08)';
  const color = live ? '#22d3ee' : 'rgba(255,255,255,0.5)';
  const border = live ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.12)';

  return (
    <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-1">
      <span
        className="inline-block px-2 py-0.5 rounded-full text-[10px] tracking-wider uppercase"
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          backgroundColor: bg,
          color,
          border: `1px solid ${border}`,
        }}
      >
        {label}
      </span>
      {!live && fallbackMessage && (
        <span
          className="text-[9px] text-white/30"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {fallbackMessage}
        </span>
      )}
    </div>
  );
}

// ── Live Data Hook Aggregator ──────────────────────────────

interface LiveDataMap {
  embeddings: { data: unknown; isLive: boolean; fallback?: string };
  attention: { data: unknown; isLive: boolean; fallback?: string };
  distribution: { data: unknown; isLive: boolean; fallback?: string };
  delegation: { data: unknown; isLive: boolean; fallback?: string };
  moat: { data: unknown; isLive: boolean; fallback?: string };
  'feedback-loop': { data: unknown; isLive: boolean; fallback?: string };
}

function useLiveSceneData(projectSlug: string | undefined): LiveDataMap {
  const embeddings = useEmbeddingsVizData(projectSlug);
  const attention = useAttentionVizData(projectSlug ? [projectSlug] : undefined);
  const distribution = useDistributionVizData(
    projectSlug ? 'project' : undefined,
    projectSlug,
  );
  const delegation = useDelegationVizData(undefined); // no planId in showcase context
  const moat = useMoatVizData(projectSlug);
  const feedback = useFeedbackVizData(undefined); // no runId in showcase context

  return useMemo(() => {
    const result = (
      hook: { data: unknown; isLoading: boolean; error: string | null },
      hasInput: boolean,
    ): { data: unknown; isLive: boolean; fallback?: string } => {
      if (!hasInput) {
        return { data: null, isLive: false, fallback: 'No project selected' };
      }
      if (hook.isLoading) {
        return { data: null, isLive: false, fallback: 'Loading...' };
      }
      if (hook.error) {
        return { data: hook.data, isLive: false, fallback: 'No data \u2014 showing demo' };
      }
      if (hook.data) {
        return { data: hook.data, isLive: true };
      }
      return { data: null, isLive: false, fallback: 'No data \u2014 showing demo' };
    };

    const hasProject = !!projectSlug;

    return {
      embeddings: result(embeddings, hasProject),
      attention: result(attention, hasProject),
      distribution: result(distribution, hasProject),
      delegation: result(delegation, false), // always demo in showcase (no planId)
      moat: result(moat, hasProject),
      'feedback-loop': result(feedback, false), // always demo in showcase (no runId)
    };
  }, [embeddings, attention, distribution, delegation, moat, feedback, projectSlug]);
}

// ── Fullscreen Overlay ──────────────────────────────────────

function FullscreenOverlay({
  sceneIndex,
  liveDataMap,
  projectName,
  onClose,
  onPrev,
  onNext,
}: {
  sceneIndex: number;
  liveDataMap: LiveDataMap;
  projectName: string | null;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const scene = SCENES[sceneIndex];
  const isDataScene = DATA_SCENE_KEYS.has(scene.key);
  const liveInfo = isDataScene
    ? liveDataMap[scene.key as keyof LiveDataMap]
    : null;
  const isLive = liveInfo?.isLive ?? false;

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          onPrev();
          break;
        case 'ArrowRight':
          onNext();
          break;
      }
    };
    window.addEventListener('keydown', handler);
    // Lock body scroll
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose, onPrev, onNext]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ backgroundColor: '#000' }}
      onClick={onClose}
    >
      {/* Scene title */}
      <div className="absolute top-6 left-0 right-0 text-center z-10 pointer-events-none">
        <h2
          className="text-white/70 text-sm tracking-[0.2em] uppercase"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {scene.title}
        </h2>
      </div>

      {/* Canvas container */}
      <div
        className="w-full h-full"
        onClick={(e) => e.stopPropagation()}
      >
        <ParticleViz
          key={scene.key}
          scene={scene.key}
          data={isLive && liveInfo?.data ? liveInfo.data : undefined}
          width="100%"
          height="100%"
        />
      </div>

      {/* Navigation arrows */}
      <button
        className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors text-3xl p-2"
        onClick={(e) => {
          e.stopPropagation();
          onPrev();
        }}
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
        aria-label="Previous scene"
      >
        &larr;
      </button>
      <button
        className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors text-3xl p-2"
        onClick={(e) => {
          e.stopPropagation();
          onNext();
        }}
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
        aria-label="Next scene"
      >
        &rarr;
      </button>

      {/* Bottom overlay: pagination + data source */}
      <div
        className="absolute bottom-6 left-0 right-0 text-center text-white/40 text-sm flex flex-col items-center gap-1"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {projectName && (
          <span className="text-[10px] tracking-wider">
            {projectName}
            {' \u2014 '}
            <span style={{ color: isLive ? '#22d3ee' : 'rgba(255,255,255,0.4)' }}>
              {isLive ? 'LIVE' : 'DEMO'}
            </span>
          </span>
        )}
        <span>
          {sceneIndex + 1}/{SCENES.length}
        </span>
      </div>

      {/* Close button */}
      <button
        className="absolute top-4 right-4 text-white/40 hover:text-white/80 transition-colors text-xl p-2"
        onClick={onClose}
        aria-label="Close fullscreen"
      >
        &times;
      </button>
    </div>
  );
}

// ── Scene Card ──────────────────────────────────────────────

function SceneCard({
  scene,
  liveInfo,
  onClick,
}: {
  scene: SceneEntry;
  liveInfo: { data: unknown; isLive: boolean; fallback?: string } | null;
  onClick: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  const isDataScene = scene.mode === 'data';
  const isLive = liveInfo?.isLive ?? false;

  // Lazy-load: only mount ParticleViz when card enters viewport
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect(); // once visible, stay mounted
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={cardRef}
      className="group cursor-pointer rounded-lg overflow-hidden border border-border-subtle hover:border-border-default transition-colors"
      onClick={onClick}
    >
      {/* 16:9 aspect ratio container */}
      <div className="relative" style={{ paddingBottom: '56.25%' }}>
        <div className="absolute inset-0">
          {isVisible ? (
            <ParticleViz
              scene={scene.key}
              data={isLive && liveInfo?.data ? liveInfo.data : undefined}
              width="100%"
              height="100%"
            />
          ) : (
            <div className="w-full h-full bg-black" />
          )}
        </div>
        {/* Badge */}
        {isDataScene ? (
          <DataBadge live={isLive} fallbackMessage={liveInfo?.fallback} />
        ) : (
          <DataBadge live={false} />
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white/60 text-sm tracking-wider uppercase"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            Fullscreen
          </span>
        </div>
      </div>
      {/* Title + description */}
      <div className="p-3 bg-surface-base">
        <h3
          className="text-text-primary text-sm tracking-[0.15em] uppercase mb-1"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {scene.title}
        </h3>
        <p className="text-text-tertiary text-xs">{scene.description}</p>
      </div>
    </div>
  );
}

// ── Page Component ──────────────────────────────────────────

export function ParticlesShowcasePage() {
  const wsSlug = useWorkspaceSlug();
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);

  // Project selector state
  const [projects, setProjects] = useState<{ slug: string; name: string }[]>([]);
  const [selectedProject, setSelectedProject] = useState('none');

  // Load workspace projects
  useEffect(() => {
    async function loadProjects() {
      try {
        const wsProjects = await workspacesApi.listProjects(wsSlug);
        setProjects(wsProjects.map((p) => ({ slug: p.slug, name: p.name })));
      } catch {
        // No projects available
      }
    }
    loadProjects();
  }, [wsSlug]);

  const projectSlug = selectedProject !== 'none' ? selectedProject : undefined;
  const projectName = projects.find((p) => p.slug === projectSlug)?.name ?? null;

  const projectOptions = [
    { value: 'none', label: 'No project (all demo)' },
    ...projects.map((p) => ({ value: p.slug, label: p.name })),
  ];

  // Wire live data hooks
  const liveDataMap = useLiveSceneData(projectSlug);

  const handleClose = useCallback(() => setFullscreenIndex(null), []);
  const handlePrev = useCallback(
    () =>
      setFullscreenIndex((i) =>
        i !== null ? (i - 1 + SCENES.length) % SCENES.length : null,
      ),
    [],
  );
  const handleNext = useCallback(
    () =>
      setFullscreenIndex((i) =>
        i !== null ? (i + 1) % SCENES.length : null,
      ),
    [],
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1
            className="text-text-primary text-lg tracking-[0.2em] uppercase"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            Particle Scenes
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            {SCENES.length} visualizations &mdash; click to fullscreen, use arrow keys to navigate
          </p>
        </div>

        {/* Project Selector */}
        <div className="w-full md:w-72">
          <Select
            options={projectOptions}
            value={selectedProject}
            onChange={setSelectedProject}
            placeholder="Select a project..."
          />
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SCENES.map((scene, i) => {
          const isDataScene = DATA_SCENE_KEYS.has(scene.key);
          const liveInfo = isDataScene
            ? liveDataMap[scene.key as keyof LiveDataMap]
            : null;

          return (
            <SceneCard
              key={scene.key}
              scene={scene}
              liveInfo={liveInfo}
              onClick={() => setFullscreenIndex(i)}
            />
          );
        })}
      </div>

      {/* Fullscreen overlay */}
      {fullscreenIndex !== null && (
        <FullscreenOverlay
          sceneIndex={fullscreenIndex}
          liveDataMap={liveDataMap}
          projectName={projectName}
          onClose={handleClose}
          onPrev={handlePrev}
          onNext={handleNext}
        />
      )}
    </div>
  );
}
