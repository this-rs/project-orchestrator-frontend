/**
 * ParticlesShowcasePage — /particles
 *
 * Grid of all 14 particle scenes with:
 * - 2-column responsive grid, each scene in 16:9
 * - Title + description under each card
 * - Click → fullscreen overlay with pure black background
 * - Slideshow mode: arrow keys to navigate, pagination "N/14"
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ParticleViz } from '@/components/particles/ParticleViz';

// ── Scene Catalog ──────────────────────────────────────────

interface SceneEntry {
  key: string;
  title: string;
  description: string;
}

const SCENES: SceneEntry[] = [
  { key: 'leverage', title: 'Leverage', description: 'One input amplifies into many outputs' },
  { key: 'system', title: 'System', description: 'Interconnected nodes forming a network' },
  {
    key: 'context-window',
    title: 'Context Window',
    description: 'Bounded capacity filling with tokens',
  },
  { key: 'focus', title: 'Focus', description: 'Particles converge toward a bright center' },
  {
    key: 'prompt-output',
    title: 'Prompt \u2192 Output',
    description: 'Input tokens transform into output',
  },
  { key: 'human-ai', title: 'Human + AI', description: 'Two orbital systems interacting' },
  { key: 'delegation', title: 'Delegation', description: 'Dispatcher sends waves to agents' },
  { key: 'embeddings', title: 'Embeddings', description: 'Clustered particles in vector space' },
  { key: 'attention', title: 'Attention', description: 'Spotlight reveals relevant particles' },
  {
    key: 'fine-tuning',
    title: 'Fine-tuning',
    description: 'Chaos gradually organizes into order',
  },
  {
    key: 'signal-noise',
    title: 'Signal / Noise',
    description: 'Bright signals emerge from noise',
  },
  {
    key: 'distribution',
    title: 'Distribution',
    description: 'Information ripples outward from source',
  },
  {
    key: 'feedback-loop',
    title: 'Feedback Loop',
    description: 'Particles circulate through stations',
  },
  { key: 'moat', title: 'Moat', description: 'Concentric defensive layers orbiting core' },
];

// ── Fullscreen Overlay ──────────────────────────────────────

function FullscreenOverlay({
  sceneIndex,
  onClose,
  onPrev,
  onNext,
}: {
  sceneIndex: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const scene = SCENES[sceneIndex];

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

      {/* Pagination */}
      <div
        className="absolute bottom-6 left-0 right-0 text-center text-white/40 text-sm"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {sceneIndex + 1}/{SCENES.length}
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
  onClick,
}: {
  scene: SceneEntry;
  onClick: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

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
            <ParticleViz scene={scene.key} width="100%" height="100%" />
          ) : (
            <div className="w-full h-full bg-black" />
          )}
        </div>
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
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);

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

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SCENES.map((scene, i) => (
          <SceneCard
            key={scene.key}
            scene={scene}
            onClick={() => setFullscreenIndex(i)}
          />
        ))}
      </div>

      {/* Fullscreen overlay */}
      {fullscreenIndex !== null && (
        <FullscreenOverlay
          sceneIndex={fullscreenIndex}
          onClose={handleClose}
          onPrev={handlePrev}
          onNext={handleNext}
        />
      )}
    </div>
  );
}
