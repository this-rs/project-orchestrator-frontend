/**
 * DistributionScene — slide 12/15
 * "le contenu brillant sans distribution reste invisible"
 *
 * Split layout:
 *   Left — Brilliant content alone (isolated glow dot, no connections)
 *   Right — Content + Distribution (radial tree expanding progressively)
 *
 * Counter: "portée: N" animated 0 → maxReach
 */

import { ParticlePool } from '../engine/ParticlePool';
import { ParticleEngine } from '../engine/ParticleEngine';
import { DragForce, NoiseForce } from '../engine/forces';
import { TAU } from '../engine/types';
import type { Particle } from '../engine/types';
import { renderParticles, renderGlowDot, renderLine } from '../renderer/CanvasRenderer';
import { renderLabel, renderTitle } from '../renderer/TextRenderer';
import type { ParticleScene } from './types';
import { smoothstep, clamp, easeInOut } from './types';

// ── Data ──────────────────────────────────────────────────────

export interface DistributionData {
  nodes: Array<{ id: string; parent?: string; label?: string }>;
  maxReach: number;
}

const DEFAULT_DATA: DistributionData = {
  nodes: [
    { id: 'root', label: 'Source' },
    { id: 'a1', parent: 'root', label: 'Channel A' },
    { id: 'a2', parent: 'root', label: 'Channel B' },
    { id: 'a3', parent: 'root', label: 'Channel C' },
    { id: 'a4', parent: 'root', label: 'Channel D' },
    { id: 'a5', parent: 'root', label: 'Channel E' },
    { id: 'b1', parent: 'a1', label: 'Sub A1' },
    { id: 'b2', parent: 'a1', label: 'Sub A2' },
    { id: 'b3', parent: 'a2', label: 'Sub B1' },
    { id: 'b4', parent: 'a2', label: 'Sub B2' },
    { id: 'b5', parent: 'a3', label: 'Sub C1' },
    { id: 'b6', parent: 'a4', label: 'Sub D1' },
    { id: 'b7', parent: 'a4', label: 'Sub D2' },
    { id: 'b8', parent: 'a5', label: 'Sub E1' },
    { id: 'c1', parent: 'b1', label: 'Leaf 1' },
    { id: 'c2', parent: 'b2', label: 'Leaf 2' },
    { id: 'c3', parent: 'b3', label: 'Leaf 3' },
    { id: 'c4', parent: 'b5', label: 'Leaf 4' },
    { id: 'c5', parent: 'b6', label: 'Leaf 5' },
    { id: 'c6', parent: 'b7', label: 'Leaf 6' },
  ],
  maxReach: 80,
};

// ── Constants ─────────────────────────────────────────────────

const POOL_CAPACITY = 64;
const LEVEL_SPACING = 50;
const JITTER_AMOUNT = 0.15;

// ── Tree node layout ──────────────────────────────────────────

interface TreeNode {
  id: string;
  label: string;
  parent: string | null;
  children: TreeNode[];
  level: number;
  x: number;
  y: number;
  angle: number;
  index: number; // global index for reveal ordering
}

// ── Scene ─────────────────────────────────────────────────────

export class DistributionScene implements ParticleScene {
  readonly name = 'distribution';
  readonly title = 'DISTRIBUTION';
  readonly description =
    'le contenu brillant sans distribution reste invisible';

  private pool: ParticlePool | null = null;
  private engine: ParticleEngine | null = null;

  private data: DistributionData = DEFAULT_DATA;
  private w = 0;
  private h = 0;
  private progress = 0;
  private time = 0;

  // Left side
  private leftCx = 0;
  private leftCy = 0;

  // Right side (tree)
  private rightCx = 0;
  private rightCy = 0;
  private treeNodes: TreeNode[] = [];
  private totalNodes = 0;

  // Ambient particles for right side
  private spawned = false;

  setData(data: unknown): void {
    const d = data as DistributionData;
    if (d && Array.isArray(d.nodes)) {
      this.data = d;
    }
  }

  init(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.computeLayout();
    this.buildTree();

    this.pool = new ParticlePool(POOL_CAPACITY);
    this.engine = new ParticleEngine(this.pool, 0.99);
    this.engine.addForce(new DragForce({ coefficient: 0.8 }));
    this.engine.addForce(
      new NoiseForce({ frequency: 0.005, amplitude: 8, speed: 0.15 }),
    );
    this.spawned = false;
  }

  resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.computeLayout();
    this.buildTree();
    if (this.pool) this.pool.reset();
    this.spawned = false;
  }

  private computeLayout(): void {
    // Left panel center
    this.leftCx = this.w * 0.22;
    this.leftCy = this.h * 0.48;
    // Right panel center (source node)
    this.rightCx = this.w * 0.65;
    this.rightCy = this.h * 0.48;
  }

  private buildTree(): void {
    const { nodes } = this.data;
    if (nodes.length === 0) {
      this.treeNodes = [];
      this.totalNodes = 0;
      return;
    }

    // Build parent-child map
    const nodeMap = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];

    for (const n of nodes) {
      const tn: TreeNode = {
        id: n.id,
        label: n.label ?? n.id,
        parent: n.parent ?? null,
        children: [],
        level: 0,
        x: 0,
        y: 0,
        angle: 0,
        index: 0,
      };
      nodeMap.set(n.id, tn);
    }

    // Link children
    for (const n of nodes) {
      const tn = nodeMap.get(n.id)!;
      if (n.parent && nodeMap.has(n.parent)) {
        const parent = nodeMap.get(n.parent)!;
        parent.children.push(tn);
        tn.parent = n.parent;
      } else {
        roots.push(tn);
      }
    }

    // Compute levels via BFS
    const queue = [...roots];
    for (const r of roots) r.level = 0;
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const child of current.children) {
        child.level = current.level + 1;
        queue.push(child);
      }
    }

    // Layout radial tree from rightCx, rightCy
    const cx = this.rightCx;
    const cy = this.rightCy;
    const spacing = Math.min(LEVEL_SPACING, Math.min(this.w, this.h) * 0.12);

    // Assign positions recursively
    let globalIndex = 0;

    const layoutNode = (
      node: TreeNode,
      _parentAngle: number,
      spreadAngle: number,
    ): void => {
      node.index = globalIndex++;

      if (node.level === 0) {
        node.x = cx;
        node.y = cy;
        node.angle = -Math.PI / 2; // start up
      } else {
        const radius = spacing * node.level;
        node.x = cx + Math.cos(node.angle) * radius;
        node.y = cy + Math.sin(node.angle) * radius;
      }

      const childCount = node.children.length;
      if (childCount === 0) return;

      // Spread children around the parent angle
      const childSpread =
        node.level === 0 ? TAU : Math.min(spreadAngle, Math.PI * 0.8);
      const baseAngle =
        node.level === 0 ? -Math.PI / 2 : node.angle;

      for (let i = 0; i < childCount; i++) {
        const child = node.children[i];
        // Distribute children evenly within the spread angle
        const offset =
          childCount === 1
            ? 0
            : childSpread * ((i / (childCount - 1)) - 0.5);
        child.angle =
          baseAngle + offset + (Math.random() - 0.5) * JITTER_AMOUNT;
        layoutNode(child, child.angle, childSpread / Math.max(childCount, 2));
      }
    };

    for (const root of roots) {
      layoutNode(root, -Math.PI / 2, TAU);
    }

    // Flatten
    this.treeNodes = [];
    const flatten = (node: TreeNode): void => {
      this.treeNodes.push(node);
      for (const child of node.children) flatten(child);
    };
    for (const root of roots) flatten(root);
    this.totalNodes = this.treeNodes.length;
  }

  update(dt: number, progress: number, time: number): void {
    this.progress = progress;
    this.time = time;
    if (!this.pool || !this.engine) return;

    // Spawn ambient dust particles on right side
    if (!this.spawned) {
      this.spawned = true;
      for (let i = 0; i < 20; i++) {
        const angle = (TAU * i) / 20;
        const r = 30 + Math.random() * 80;
        this.pool.spawn({
          x: this.rightCx + Math.cos(angle) * r,
          y: this.rightCy + Math.sin(angle) * r,
          vx: (Math.random() - 0.5) * 3,
          vy: (Math.random() - 0.5) * 3,
          size: 0.8 + Math.random() * 0.5,
          opacity: 0.1 + Math.random() * 0.15,
          color: '#ffffff',
          maxLife: 9999,
          group: 0,
        });
      }
    }

    // Keep ambient particles alive
    this.pool.forEachActive((p: Particle) => {
      p.life = 1;
    });

    this.engine.step(dt, time);
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const progress = this.progress;
    const time = this.time;
    const revealProgress = easeInOut(progress);

    // ── Title ───────────────────────────────────────────
    renderTitle(ctx, this.title, width, 0.5);

    // ── Divider line (faint) ────────────────────────────
    const divX = width * 0.44;
    renderLine(ctx, divX, 50, divX, height - 50, 0.06, 1, '#ffffff');

    // ═══════════════════════════════════════════════════
    // LEFT SIDE — Brilliant content, isolated
    // ═══════════════════════════════════════════════════

    const leftCx = this.leftCx;
    const leftCy = this.leftCy;

    // Isolated glow dot (the content)
    const leftPulse = 0.7 + 0.3 * Math.sin(time * 2.5);
    renderGlowDot(ctx, leftCx, leftCy, 8, leftPulse, '#ffffff', 30);

    // Label under it
    renderLabel(ctx, {
      text: 'contenu brillant',
      x: leftCx,
      y: leftCy + 40,
      opacity: 0.5,
      size: 9,
      color: '#ffffff',
      align: 'center',
    });

    // ═══════════════════════════════════════════════════
    // RIGHT SIDE — Content + Distribution network
    // ═══════════════════════════════════════════════════

    const maxRevealed = Math.floor(this.totalNodes * revealProgress);
    const nodeMap = new Map<string, TreeNode>();
    for (const n of this.treeNodes) nodeMap.set(n.id, n);

    // Draw connection lines first (below nodes)
    for (const node of this.treeNodes) {
      if (node.index >= maxRevealed) continue;
      if (!node.parent) continue;

      const parentNode = nodeMap.get(node.parent);
      if (!parentNode || parentNode.index >= maxRevealed) continue;

      // Node opacity based on reveal
      const nodeT = node.index / Math.max(this.totalNodes, 1);
      const nodeOpacity = smoothstep(nodeT, nodeT + 0.05, revealProgress);
      const lineOpacity = nodeOpacity * 0.2;

      renderLine(
        ctx,
        parentNode.x,
        parentNode.y,
        node.x,
        node.y,
        lineOpacity,
        0.8,
        '#ffffff',
      );
    }

    // Draw tree nodes
    for (const node of this.treeNodes) {
      if (node.index >= maxRevealed) continue;

      const nodeT = node.index / Math.max(this.totalNodes, 1);
      const nodeOpacity = smoothstep(nodeT, nodeT + 0.05, revealProgress);

      if (node.level === 0) {
        // Source node — same glow as left side
        const sourcePulse = 0.7 + 0.3 * Math.sin(time * 2.5);
        renderGlowDot(
          ctx,
          node.x,
          node.y,
          8,
          sourcePulse * nodeOpacity,
          '#ffffff',
          30,
        );
      } else {
        // Network node — smaller dot
        const size = Math.max(1.5, 3.5 - node.level * 0.6);
        const dotOpacity = nodeOpacity * (1.0 - node.level * 0.15);
        renderGlowDot(
          ctx,
          node.x,
          node.y,
          size,
          dotOpacity,
          '#ffffff',
          size * 3,
        );
      }
    }

    // Ambient particles
    if (this.pool) {
      // Only show ambient particles with reveal progress
      ctx.save();
      ctx.globalAlpha = clamp(revealProgress * 2, 0, 0.4);
      renderParticles(ctx, this.pool, { glow: true, globalAlpha: 0.3 });
      ctx.restore();
    }

    // ── Counter ───────────────────────────────────────
    const maxReach = this.data.maxReach;
    // Map progress to reach: 0 → 25 → 80 (non-linear)
    let reach: number;
    if (progress < 0.4) {
      reach = Math.floor((progress / 0.4) * 25);
    } else {
      reach = Math.floor(25 + ((progress - 0.4) / 0.6) * (maxReach - 25));
    }
    reach = clamp(reach, 0, maxReach);

    renderLabel(ctx, {
      text: `portée: ${reach}`,
      x: this.rightCx,
      y: height - 30,
      opacity: 0.7,
      size: 12,
      color: '#22d3ee',
      align: 'center',
    });

    // Left side "portée: 0" to emphasize isolation
    renderLabel(ctx, {
      text: 'portée: 0',
      x: leftCx,
      y: height - 30,
      opacity: 0.35,
      size: 12,
      color: '#888888',
      align: 'center',
    });
  }

  dispose(): void {
    if (this.engine) this.engine.reset();
    this.pool = null;
    this.engine = null;
    this.treeNodes = [];
  }
}
