/**
 * EmbeddingsScene — "du chaos émerge la structure — le sens naît de la proximité"
 *
 * Phase 1: Chaos (0-40%) — ~60 particles brownian motion (NoiseForce)
 * Phase 2: Clustering (40-80%) — Spring force toward 4 cluster centers, connections appear
 * Phase 3: Structure (80-100%) — Stable clusters with labels, gentle noise to stay alive
 *
 * Interactive enrichment (opt-in via data.clusters[].files):
 *   - Each particle carries metadata { filePath, clusterLabel, isHotspot, language }
 *   - Hotspot particles are larger with a subtle red tint
 *   - Orphan cluster particles are scattered (no spring target)
 */

import type { ParticleScene } from './types';
import { smoothstep } from './types';
import {
  ParticlePool,
  ParticleEngine,
  NoiseForce,
  DragForce,
  BoundaryForce,
} from '../engine';
import type { Particle } from '../engine/types';
import { renderParticles, renderLine } from '../renderer/CanvasRenderer';
import { renderLabel, renderTitle } from '../renderer/TextRenderer';

export interface EmbeddingsData {
  clusters: Array<{
    label: string;
    count: number;
    color?: string;
    files?: Array<{
      path: string;
      language?: string;
      isHotspot: boolean;
    }>;
    isOrphan?: boolean;
  }>;
}

const DEFAULT_LABELS = ['code', 'design', 'data', 'infra'];
const DEFAULT_CLUSTERS: EmbeddingsData = {
  clusters: DEFAULT_LABELS.map((label) => ({ label, count: 15 })),
};

// Cluster center positions (normalized 0..1) — up to 8 positions
const CLUSTER_POSITIONS = [
  { x: 0.25, y: 0.35 },
  { x: 0.75, y: 0.35 },
  { x: 0.25, y: 0.65 },
  { x: 0.75, y: 0.65 },
  { x: 0.5, y: 0.25 },
  { x: 0.5, y: 0.75 },
  { x: 0.15, y: 0.5 },
  { x: 0.85, y: 0.5 },
];

const MAX_CAPACITY = 120;
const SPRING_STIFFNESS = 6;
const HOTSPOT_SIZE = 3.5;
const NORMAL_SIZE_MIN = 1.5;
const NORMAL_SIZE_MAX = 2.5;
const HOTSPOT_COLOR = '#fca5a5'; // red-300 subtle
const ORPHAN_GROUP = 999;

export class EmbeddingsScene implements ParticleScene {
  readonly name = 'embeddings';
  readonly title = 'EMBEDDINGS';
  readonly description =
    'du chaos émerge la structure — le sens naît de la proximité';

  private pool!: ParticlePool;
  private engine!: ParticleEngine;
  private noise!: NoiseForce;
  private boundary!: BoundaryForce;
  private w = 0;
  private h = 0;
  private progress = 0;
  private data: EmbeddingsData = DEFAULT_CLUSTERS;
  private initialized = false;

  // Cluster centers in pixel coords (computed on init/resize)
  private clusterCenters: Array<{ x: number; y: number; label: string }> = [];

  init(width: number, height: number): void {
    this.w = width;
    this.h = height;

    this.pool = new ParticlePool(MAX_CAPACITY);
    this.engine = new ParticleEngine(this.pool, 0.96);

    this.noise = new NoiseForce({
      frequency: 0.008,
      amplitude: 60,
      speed: 0.5,
    });
    const drag = new DragForce({ coefficient: 3 });
    this.boundary = new BoundaryForce({
      left: 10,
      right: width - 10,
      top: 50,
      bottom: height - 50,
      bounce: 0.3,
    });

    this.engine.addForce(this.noise);
    this.engine.addForce(drag);
    this.engine.addForce(this.boundary);

    this.buildClusters();
    this.spawnParticles();
    this.initialized = true;
  }

  private buildClusters(): void {
    const { w, h, data } = this;
    // Filter out orphan clusters for position assignment
    const nonOrphanClusters = data.clusters.filter((c) => !c.isOrphan);
    const labels =
      nonOrphanClusters.length > 0
        ? nonOrphanClusters.map((c) => c.label)
        : DEFAULT_LABELS;

    this.clusterCenters = [];
    for (let i = 0; i < Math.min(labels.length, CLUSTER_POSITIONS.length); i++) {
      const pos = CLUSTER_POSITIONS[i];
      this.clusterCenters.push({
        x: pos.x * w,
        y: pos.y * h,
        label: labels[i],
      });
    }
  }

  private spawnParticles(): void {
    this.pool.reset();
    const { w, h, clusterCenters, data } = this;
    const nonOrphanClusters = data.clusters.filter((c) => !c.isOrphan);
    const orphanCluster = data.clusters.find((c) => c.isOrphan);

    // Spawn particles for each non-orphan cluster
    for (let ci = 0; ci < Math.min(nonOrphanClusters.length, clusterCenters.length); ci++) {
      const cluster = nonOrphanClusters[ci];
      const files = cluster.files ?? [];
      const particleCount = Math.max(files.length, Math.min(cluster.count, 20));

      for (let j = 0; j < particleCount; j++) {
        const file = files[j]; // may be undefined if count > files.length
        const isHotspot = file?.isHotspot ?? false;
        const filePath = file?.path;
        const fileName = filePath ? filePath.split('/').pop() ?? filePath : undefined;

        this.pool.spawn({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 30,
          vy: (Math.random() - 0.5) * 30,
          size: isHotspot ? HOTSPOT_SIZE : NORMAL_SIZE_MIN + Math.random() * (NORMAL_SIZE_MAX - NORMAL_SIZE_MIN),
          opacity: isHotspot ? 0.9 : 0.5 + Math.random() * 0.3,
          color: isHotspot ? HOTSPOT_COLOR : '#ffffff',
          maxLife: 99999,
          group: ci,
          metadata: {
            filePath: filePath ?? null,
            fileName: fileName ?? null,
            clusterLabel: cluster.label,
            isHotspot,
            language: file?.language ?? null,
            label: fileName
              ? `${fileName}${isHotspot ? ' (hotspot)' : ''}`
              : cluster.label,
          },
        });
      }
    }

    // Spawn orphan particles — no cluster assignment, scattered
    if (orphanCluster && orphanCluster.count > 0) {
      const orphanCount = Math.min(orphanCluster.count, 15);
      const orphanFiles = orphanCluster.files ?? [];
      for (let j = 0; j < orphanCount; j++) {
        const file = orphanFiles[j];
        const filePath = file?.path;
        const fileName = filePath ? filePath.split('/').pop() ?? filePath : undefined;

        this.pool.spawn({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 15,
          vy: (Math.random() - 0.5) * 15,
          size: 1.2,
          opacity: 0.35,
          color: '#64748b', // slate-500
          maxLife: 99999,
          group: ORPHAN_GROUP,
          metadata: {
            filePath: filePath ?? null,
            fileName: fileName ?? null,
            clusterLabel: 'Orphans',
            isHotspot: false,
            language: file?.language ?? null,
            label: fileName ?? 'orphan file',
          },
        });
      }
    }
  }

  resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.boundary.left = 10;
    this.boundary.right = width - 10;
    this.boundary.top = 50;
    this.boundary.bottom = height - 50;
    this.buildClusters();
    this.spawnParticles();
  }

  update(dt: number, progress: number, time: number): void {
    this.progress = progress;
    if (!this.initialized) return;

    // cluster_phase = smoothstep(0.3, 0.7, progress)
    const clusterPhase = smoothstep(0.3, 0.7, progress);

    // Per-particle spring force toward assigned cluster center
    this.pool.forEachActive((p: Particle) => {
      const ci = p.group;
      // Skip orphan particles — they don't cluster
      if (ci === ORPHAN_GROUP) return;
      if (ci >= 0 && ci < this.clusterCenters.length) {
        const target = this.clusterCenters[ci];
        // F_spring = -stiffness · cluster_phase · (pos - target)
        p.ax += SPRING_STIFFNESS * clusterPhase * (target.x - p.x);
        p.ay += SPRING_STIFFNESS * clusterPhase * (target.y - p.y);
      }
    });

    // Noise amplitude: amplitude * (1 - cluster_phase * 0.8)
    this.noise.amplitude = 60 * (1 - clusterPhase * 0.8);

    this.engine.step(dt, time);
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.initialized) return;
    const { clusterCenters, pool, progress } = this;
    const clusterPhase = smoothstep(0.3, 0.7, progress);
    const connectionThreshold = Math.min(width, height) * 0.12;

    // ── Intra-cluster connections ──
    if (clusterPhase > 0.1) {
      const particles: Particle[] = [];
      pool.forEachActive((p: Particle) => particles.push(p));

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          if (particles[i].group !== particles[j].group) continue;
          if (particles[i].group === ORPHAN_GROUP) continue; // no connections for orphans
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < connectionThreshold) {
            // opacity = (1 - dist/threshold) · cluster_phase · 0.3
            const alpha =
              (1 - dist / connectionThreshold) * clusterPhase * 0.3;
            renderLine(
              ctx,
              particles[i].x,
              particles[i].y,
              particles[j].x,
              particles[j].y,
              alpha,
              0.5,
              'rgba(255,255,255,1)',
            );
          }
        }
      }
    }

    // ── Particles ──
    renderParticles(ctx, pool, { glow: true, globalAlpha: 0.8 });

    // ── Hotspot glow overlay ──
    // Draw a subtle red glow for hotspot particles in structure phase
    if (clusterPhase > 0.3) {
      const glowAlpha = smoothstep(0.3, 0.7, clusterPhase) * 0.4;
      pool.forEachActive((p: Particle) => {
        if (!p.metadata?.isHotspot) return;
        ctx.save();
        ctx.globalAlpha = glowAlpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(248,113,113,0.3)'; // red-400 glow
        ctx.fill();
        ctx.restore();
      });
    }

    // ── Cluster labels ──
    // label_opacity = smoothstep(0.6, 0.8, progress)
    const labelOpacity = smoothstep(0.6, 0.8, progress);
    if (labelOpacity > 0.01) {
      for (let i = 0; i < clusterCenters.length; i++) {
        const c = clusterCenters[i];
        renderLabel(ctx, {
          text: c.label,
          x: c.x,
          y: c.y + 50,
          opacity: labelOpacity * 0.7,
          size: 10,
          color: '#22d3ee',
          align: 'center',
        });
      }

      // Orphan label (bottom center, dimmed)
      const hasOrphans = this.data.clusters.some((c) => c.isOrphan && c.count > 0);
      if (hasOrphans) {
        renderLabel(ctx, {
          text: 'orphans',
          x: width / 2,
          y: height - 55,
          opacity: labelOpacity * 0.4,
          size: 9,
          color: '#64748b',
          align: 'center',
        });
      }
    }

    // ── Title ──
    renderTitle(ctx, this.title, width, 0.5);

    // ── Phase labels ──
    if (progress < 0.3) {
      const op =
        smoothstep(0, 0.05, progress) * (1 - smoothstep(0.2, 0.3, progress));
      renderLabel(ctx, {
        text: 'CHAOS',
        x: width / 2,
        y: height - 30,
        opacity: op * 0.5,
        size: 11,
        align: 'center',
      });
    }
    if (progress > 0.8) {
      const op = smoothstep(0.8, 0.9, progress);
      renderLabel(ctx, {
        text: 'STRUCTURE',
        x: width / 2,
        y: height - 30,
        opacity: op * 0.5,
        size: 11,
        align: 'center',
      });
    }
  }

  dispose(): void {
    if (this.pool) this.pool.reset();
    this.clusterCenters = [];
    this.initialized = false;
  }

  setData(data: unknown): void {
    const d = data as EmbeddingsData;
    if (d?.clusters && Array.isArray(d.clusters)) {
      this.data = d;
      if (this.initialized) {
        this.buildClusters();
        this.spawnParticles();
      }
    }
  }

  /** Expose pool for hit-testing in interactive mode */
  getPool(): ParticlePool | null {
    return this.pool ?? null;
  }
}
