/**
 * Nomenclature — the single source of truth for what things are called.
 *
 * Every visible name of a concept (sidebar, page title, breadcrumb, card
 * kicker, empty state) is read from here. Nothing else spells "Objectives"
 * or "Proposals" by hand. Only labels live here: API paths, entity types and
 * MCP identifiers are unchanged (a milestone is still a `milestone` on the wire).
 *
 * Adding a concept = one entry. Renaming a concept = one line.
 */
import {
  Home,
  Box,
  Flag,
  ClipboardList,
  CheckSquare,
  Activity,
  Zap,
  FileText,
  ScrollText,
  Scale,
  Code,
  Network,
  Brain,
  Users,
  Workflow,
  Share2,
  Route,
  Settings,
  Plug,
  Lightbulb,
  Sun,
  GitBranch,
  Rocket,
  Files,
  Blocks,
  type LucideIcon,
} from 'lucide-react'

/** Who a concept is for. `all` is shown everywhere; `software` only on code projects. */
export type Profile = 'all' | 'software'

export type ConceptKey =
  | 'overview'
  | 'projects'
  | 'objectives'
  | 'plans'
  | 'tasks'
  | 'automation'
  | 'triggers'
  | 'notes'
  | 'proposals'
  | 'decisions'
  | 'code'
  | 'featureGraphs'
  | 'skills'
  | 'personas'
  | 'protocols'
  | 'neuralRouting'
  | 'sharing'
  | 'mcpFederation'
  | 'admin'
  | 'insights'
  | 'today'
  | 'trajectory'
  | 'deployments'
  | 'documents'
  | 'architecture'

export interface Concept {
  /** Singular label ("Plan"). */
  singular: string
  /** Plural label, also the list-page title ("Plans"). */
  plural: string
  /** One line, used for tooltips-free subtitles and empty states. */
  description: string
  icon: LucideIcon
  /** Workspace-relative route segment of the list page ("plans"). */
  segment: string
  profile: Profile
}

export const NOMENCLATURE: Record<ConceptKey, Concept> = {
  overview: {
    singular: 'Overview',
    plural: 'Overview',
    description: 'Where the workspace stands right now.',
    icon: Home,
    segment: 'overview',
    profile: 'all',
  },
  projects: {
    singular: 'Project',
    plural: 'Projects',
    description: 'A body of work with its own plans, notes and decisions.',
    icon: Box,
    segment: 'projects',
    profile: 'all',
  },
  objectives: {
    singular: 'Objective',
    plural: 'Objectives',
    description: 'What the work is heading toward.',
    icon: Flag,
    segment: 'milestones',
    profile: 'all',
  },
  plans: {
    singular: 'Plan',
    plural: 'Plans',
    description: 'How an objective gets done: ordered tasks and steps.',
    icon: ClipboardList,
    segment: 'plans',
    profile: 'all',
  },
  tasks: {
    singular: 'Task',
    plural: 'Tasks',
    description: 'A unit of work inside a plan.',
    icon: CheckSquare,
    segment: 'tasks',
    profile: 'all',
  },
  automation: {
    singular: 'Automation',
    plural: 'Automation',
    description: 'Runs of the agent across plans, and what starts them.',
    icon: Activity,
    segment: 'pipelines',
    profile: 'all',
  },
  triggers: {
    singular: 'Trigger',
    plural: 'Triggers',
    description: 'Events and schedules that start an automated run.',
    icon: Zap,
    segment: 'triggers',
    profile: 'all',
  },
  notes: {
    singular: 'Note',
    plural: 'Notes',
    description: 'What was learned: guidelines, gotchas, patterns, tips.',
    icon: FileText,
    segment: 'notes',
    profile: 'all',
  },
  proposals: {
    singular: 'Proposal',
    plural: 'Proposals',
    description: 'A change put up for review before it is decided (RFC).',
    icon: ScrollText,
    segment: 'rfcs',
    profile: 'all',
  },
  decisions: {
    singular: 'Decision',
    plural: 'Decisions',
    description: 'A choice that was made, with its rationale and alternatives.',
    icon: Scale,
    segment: 'decisions',
    profile: 'all',
  },
  code: {
    singular: 'Code',
    plural: 'Code',
    description: 'Files, symbols and how they relate.',
    icon: Code,
    segment: 'code',
    profile: 'software',
  },
  featureGraphs: {
    singular: 'Feature graph',
    plural: 'Feature graphs',
    description: 'The code that makes up one feature.',
    icon: Network,
    segment: 'feature-graphs',
    profile: 'software',
  },
  skills: {
    singular: 'Skill',
    plural: 'Skills',
    description: 'Clusters of knowledge the agent activates on its own.',
    icon: Brain,
    segment: 'skills',
    profile: 'all',
  },
  personas: {
    singular: 'Persona',
    plural: 'Personas',
    description: 'An agent specialised on one area of the work.',
    icon: Users,
    segment: 'personas',
    profile: 'all',
  },
  protocols: {
    singular: 'Protocol',
    plural: 'Protocols',
    description: 'A repeatable procedure the agent follows step by step.',
    icon: Workflow,
    segment: 'protocols',
    profile: 'all',
  },
  neuralRouting: {
    singular: 'Neural routing',
    plural: 'Neural routing',
    description: 'How queries are routed to the knowledge that answers them.',
    icon: Route,
    segment: 'neural-routing',
    profile: 'all',
  },
  sharing: {
    singular: 'Sharing',
    plural: 'Sharing & privacy',
    description: 'What leaves this workspace, and under which policy.',
    icon: Share2,
    segment: 'sharing',
    profile: 'all',
  },
  mcpFederation: {
    singular: 'MCP server',
    plural: 'MCP federation',
    description: 'External tool servers the agent can call.',
    icon: Plug,
    segment: 'mcp-federation',
    profile: 'all',
  },
  admin: {
    singular: 'Administration',
    plural: 'Administration',
    description: 'Indexing, search and maintenance of the workspace.',
    icon: Settings,
    segment: 'admin',
    profile: 'all',
  },
  insights: {
    singular: 'Insights',
    plural: 'Insights',
    description: 'Health and structure metrics of one project.',
    icon: Lightbulb,
    segment: 'intelligence',
    profile: 'all',
  },
  today: {
    singular: 'Today',
    plural: 'Today',
    description: 'What is moving, what is stuck, and what to pick up next.',
    icon: Sun,
    segment: 'today',
    profile: 'all',
  },
  trajectory: {
    singular: 'Trajectory',
    plural: 'Trajectory',
    description: 'What is in progress toward your objectives, and the path travelled.',
    icon: GitBranch,
    segment: 'trajectory',
    profile: 'all',
  },
  architecture: {
    singular: 'Architecture',
    plural: 'Architecture',
    description: 'The system as built: components and what depends on what.',
    icon: Blocks,
    segment: 'architecture',
    profile: 'software',
  },
  deployments: {
    singular: 'Deployment',
    plural: 'Deployments',
    description: 'Where each project runs and what was shipped there.',
    icon: Rocket,
    segment: 'deployments',
    profile: 'software',
  },
  documents: {
    singular: 'Document',
    plural: 'Documents',
    description: 'Spreadsheets, decks and files attached to your work.',
    icon: Files,
    segment: 'documents',
    profile: 'all',
  },
}

/** Sidebar structure. A group reads as a stage of the work, not as a data type. */
export interface NavGroup {
  label: string
  items: ConceptKey[]
}

export const NAV_GROUPS: NavGroup[] = [
  { label: 'Focus', items: ['overview', 'today', 'trajectory'] },
  { label: 'Plan', items: ['projects', 'objectives', 'plans', 'tasks'] },
  { label: 'Design', items: ['architecture', 'decisions', 'proposals', 'documents'] },
  { label: 'Build', items: ['code', 'featureGraphs'] },
  { label: 'Ship', items: ['deployments', 'automation', 'triggers'] },
  { label: 'Knowledge', items: ['notes', 'skills', 'personas', 'protocols', 'neuralRouting'] },
  { label: 'System', items: ['sharing', 'mcpFederation', 'admin'] },
]

/** Workspace-relative segment → concept, for the breadcrumb. */
const BY_SEGMENT: Record<string, Concept> = Object.fromEntries(
  Object.values(NOMENCLATURE).map((c) => [c.segment, c]),
)

/** Segments that are not a list page of their own but still deserve a name. */
const EXTRA_SEGMENTS: Record<string, string> = {
  'project-milestones': NOMENCLATURE.objectives.plural,
  runner: 'Runner',
  graph: 'Dependencies',
  'vector-space': 'Vector space',
  chat: 'Chat',
}

/** Display name for a URL segment, or null when it is an identifier. */
export function segmentLabel(segment: string): string | null {
  return BY_SEGMENT[segment]?.plural ?? EXTRA_SEGMENTS[segment] ?? null
}

/** Singular noun for the entity that lives under a list segment ("plans" → "Plan"). */
export function entityNoun(listSegment: string): string | null {
  if (listSegment === 'project-milestones') return NOMENCLATURE.objectives.singular
  return BY_SEGMENT[listSegment]?.singular ?? null
}
