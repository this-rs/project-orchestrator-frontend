// ============================================================================
// INTELLIGENCE VISUALIZATION — Constants & Visual Config
// ============================================================================

import type {
  IntelligenceLayer,
  LayerConfig,
  VisibilityPreset,
  IntelligenceEntityType,
  IntelligenceRelationType,
} from '@/types/intelligence'

// ============================================================================
// LAYER CONFIGURATION
// ============================================================================

export const LAYERS: Record<IntelligenceLayer, LayerConfig> = {
  code: {
    id: 'code',
    label: 'Code',
    description: 'Files, functions, structs, traits',
    color: '#3B82F6', // blue-500
    enabled: true,
    zIndex: 2,
  },
  pm: {
    id: 'pm',
    label: 'Project',
    description: 'Plans, tasks, milestones',
    color: '#10B981', // emerald-500
    enabled: false,
    zIndex: 3,
  },
  knowledge: {
    id: 'knowledge',
    label: 'Knowledge',
    description: 'Notes, decisions, constraints',
    color: '#F59E0B', // amber-500
    enabled: true,
    zIndex: 4,
  },
  fabric: {
    id: 'fabric',
    label: 'Fabric',
    description: 'IMPORTS, CALLS, CO_CHANGED',
    color: '#94A3B8', // slate-400
    enabled: true,
    zIndex: 1,
  },
  neural: {
    id: 'neural',
    label: 'Neural',
    description: 'Synapses, energy, activation',
    color: '#06B6D4', // cyan-500
    enabled: false,
    zIndex: 5,
  },
  skills: {
    id: 'skills',
    label: 'Skills',
    description: 'Emergent knowledge clusters',
    color: '#EC4899', // pink-500
    enabled: false,
    zIndex: 7,
  },
  behavioral: {
    id: 'behavioral',
    label: 'Behavioral',
    description: 'Protocols, states, transitions (FSM)',
    color: '#F97316', // orange-500
    enabled: false,
    zIndex: 6,
  },
}

export const LAYER_ORDER: IntelligenceLayer[] = [
  'code', 'pm', 'knowledge', 'fabric', 'neural', 'skills', 'behavioral',
]

// ============================================================================
// ENTITY COLORS (from note edb565a7)
// ============================================================================

export const ENTITY_COLORS: Record<IntelligenceEntityType, string> = {
  // Code — maximally distinct hues across the color wheel
  file: '#3B82F6',       // blue-500
  function: '#22C55E',   // green-500
  struct: '#A855F7',     // purple-500
  trait: '#EF4444',      // red-500
  enum: '#64748B',       // slate-500
  // PM (Greens)
  plan: '#10B981',       // emerald-500
  task: '#22C55E',       // green-500
  step: '#BBF7D0',       // green-200
  milestone: '#F59E0B',  // amber-500
  release: '#14B8A6',    // teal-500
  commit: '#84CC16',     // lime-500
  // Knowledge (Ambers)
  note: '#F59E0B',       // amber-500
  decision: '#8B5CF6',   // violet-500
  constraint: '#DC2626', // red-600
  // Skills (Pinks)
  skill: '#EC4899',      // pink-500
  // Behavioral (Oranges)
  protocol: '#F97316',        // orange-500
  protocol_state: '#FB923C',  // orange-400
  // Feature Graphs (Fuchsia — visually distinct from blue code nodes)
  feature_graph: '#E879F9',   // fuchsia-400
}

// ============================================================================
// RELATION EDGE STYLES (from notes 1c96e215 & edb565a7)
// ============================================================================

export const EDGE_STYLES: Record<IntelligenceRelationType, {
  color: string
  strokeWidth: number
  strokeDasharray?: string
  animated?: boolean
}> = {
  IMPORTS:    { color: '#94A3B8', strokeWidth: 1.5 },
  CALLS:      { color: '#9CA3AF', strokeWidth: 1, strokeDasharray: '5 3' },
  EXTENDS:    { color: '#1E40AF', strokeWidth: 2 },
  IMPLEMENTS: { color: '#4338CA', strokeWidth: 1.5, strokeDasharray: '8 3 2 3' },
  TOUCHES:    { color: '#86EFAC', strokeWidth: 0.5, strokeDasharray: '4 4' },
  CO_CHANGED: { color: '#FED7AA', strokeWidth: 1 },
  AFFECTS:    { color: '#A855F7', strokeWidth: 2.5 },
  DISCUSSED:  { color: '#D1D5DB', strokeWidth: 0.5, strokeDasharray: '2 2' },
  LINKED_TO:  { color: '#9CA3AF', strokeWidth: 1 },
  SYNAPSE:    { color: '#22D3EE', strokeWidth: 1.5, animated: true },
  HAS_MEMBER: { color: '#F9A8D4', strokeWidth: 1 },
  CONTAINS:   { color: '#10B981', strokeWidth: 1 },
  DEPENDS_ON: { color: '#F59E0B', strokeWidth: 1.5, strokeDasharray: '6 3' },
  INFORMED_BY:{ color: '#8B5CF6', strokeWidth: 1, strokeDasharray: '4 4' },
  HAS_STATE:  { color: '#F97316', strokeWidth: 1.5 },
  TRANSITION: { color: '#EA580C', strokeWidth: 2, animated: true },
  BELONGS_TO_SKILL: { color: '#FB923C', strokeWidth: 1, strokeDasharray: '6 3' },
  INCLUDES_ENTITY:  { color: '#E879F9', strokeWidth: 1, strokeDasharray: '4 3' },
}

// ============================================================================
// NODE BASE SIZES (from note 1c96e215)
// ============================================================================

export const NODE_SIZES: Record<IntelligenceEntityType, { width: number; height: number }> = {
  file:       { width: 40, height: 40 },
  function:   { width: 20, height: 20 },
  struct:     { width: 32, height: 32 },
  trait:      { width: 28, height: 28 },
  enum:       { width: 24, height: 24 },
  plan:       { width: 80, height: 40 },
  task:       { width: 48, height: 48 },
  step:       { width: 16, height: 16 },
  milestone:  { width: 36, height: 36 },
  release:    { width: 32, height: 32 },
  commit:     { width: 20, height: 20 },
  note:       { width: 32, height: 32 },
  decision:   { width: 40, height: 40 },
  constraint: { width: 24, height: 48 },
  skill:      { width: 56, height: 56 },
  protocol:       { width: 64, height: 40 },
  protocol_state: { width: 32, height: 32 },
  feature_graph:  { width: 56, height: 40 },
}

// ============================================================================
// VISIBILITY PRESETS (from note 5eaba2df)
// ============================================================================

export const VISIBILITY_PRESETS: VisibilityPreset[] = [
  {
    id: 'code_only',
    label: 'Code',
    description: 'Architecture code pure',
    layers: ['code', 'fabric'],
    icon: 'Code2',
  },
  {
    id: 'knowledge_overlay',
    label: 'Knowledge',
    description: 'Notes & decisions sur le code',
    layers: ['code', 'knowledge', 'fabric'],
    icon: 'BookOpen',
  },
  {
    id: 'neural_view',
    label: 'Neural',
    description: 'Réseau neural de connaissances',
    layers: ['knowledge', 'neural', 'skills'],
    icon: 'Brain',
  },
  {
    id: 'pm_view',
    label: 'Project',
    description: 'Plans, tâches, milestones',
    layers: ['pm'],
    icon: 'KanbanSquare',
  },
  {
    id: 'impact_mode',
    label: 'Impact',
    description: 'Analyse d\'impact',
    layers: ['code', 'knowledge', 'fabric'],
    icon: 'Zap',
  },
  {
    id: 'behavioral_view',
    label: 'Behavioral',
    description: 'Protocoles & machines à états',
    layers: ['behavioral', 'skills'],
    icon: 'Workflow',
  },
  {
    id: 'full_stack',
    label: 'Full',
    description: 'Toutes les couches',
    layers: ['code', 'pm', 'knowledge', 'fabric', 'neural', 'skills', 'behavioral'],
    icon: 'Layers',
  },
]

// ============================================================================
// ANIMATION CONFIG (from note 5eaba2df)
// ============================================================================

export const ANIMATION = {
  // Durations (ms)
  HOVER_IN: 150,
  HOVER_OUT: 150,
  SELECT: 200,
  CREATE: 400,
  DELETE: 300,
  PULSE: 600,
  LAYER_IN: 900,
  LAYER_OUT: 650,
  LAYER_CROSSFADE: 500,

  // Budgets
  MAX_VISIBLE_EDGES: 2000,
  MAX_VISIBLE_LAYERS: 3,
  DENSITY_LOD_THRESHOLD: 0.0005,

  // Focus depth
  FOCUS_OPACITY: [1.0, 0.8, 0.4, 0.15] as const,
  FOCUS_SCALE: [1.0, 0.9, 0.7, 0.5] as const,
} as const

// ============================================================================
// EDGE PRIORITY (for budget culling — from note 5eaba2df §2.4 Rule 3)
// ============================================================================

export const EDGE_RENDER_PRIORITY: IntelligenceRelationType[] = [
  'AFFECTS',
  'IMPORTS',
  'EXTENDS',
  'IMPLEMENTS',
  'CALLS',
  'LINKED_TO',
  'HAS_MEMBER',
  'SYNAPSE',
  'CO_CHANGED',
  'CONTAINS',
  'DEPENDS_ON',
  'INFORMED_BY',
  'TRANSITION',
  'HAS_STATE',
  'BELONGS_TO_SKILL',
  'TOUCHES',
  'DISCUSSED',
]

// ============================================================================
// PROJECT COLORS — 12-color palette for differentiating projects in workspace graph
// ============================================================================

export const PROJECT_COLORS: string[] = [
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
  '#84CC16', // lime
  '#14B8A6', // teal
  '#A855F7', // purple
  '#6366F1', // indigo
]
