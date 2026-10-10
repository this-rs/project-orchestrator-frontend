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
  Layers,
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
import { activeTranslator } from '@/i18n/active'
import type { MessageKey } from '@/i18n/catalog'

/** Text of a key in the language on screen: the registry is read when used, so it follows the language. */
const tr = (key: MessageKey): string => activeTranslator().t(key)

/**
 * Who a concept is for. `all` is shown everywhere; `software` only where a workspace has a project with code
 * (MainLayout filters the menu; the route stays served either way).
 */
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
  | 'workspaces'

/**
 * How a concept explains itself to someone who discovers its screen (DESIGN.md § 0,
 * § 5 « Explaining a concept »; writing rules: website/AUDIENCE.md § 9). Three lines,
 * ONE sentence each, in the product's words: `Assistant` (never agent), `Objective`
 * (never milestone), `Proposal` (never RFC); no technical term without its definition
 * in the same sentence; benefit first; no superlative. `different` compares with what
 * the person does today (scattered notes, a chat with no memory), never with a product.
 * Rendered by `ConceptIntro` (`@/components/ui`), folded under the page title.
 *
 * The words live in `src/i18n` (`nomenclature.<key>.*`, plurals in `nav.concepts.<key>`) and are
 * read when used (getters), so every consumer follows the language without changing its code.
 */
export interface ConceptExplain {
  /** What you are looking at. */
  what: string
  /** What you get from it. */
  why: string
  /** How it differs from what you do today. */
  different: string
}

export interface Concept {
  /** Singular label ("Plan"). */
  singular: string
  /** Plural label, also the list-page title ("Plans"). */
  plural: string
  /** One line, used for tooltips-free subtitles and empty states. */
  description: string
  icon: LucideIcon
  /**
   * The colour of this kind of thing, read by every card, tile and tinted icon of the type (DESIGN.md « Cards »). The ONLY place a
   * type colour is written: pages and components never spell a hex for a type. Dark-theme 300/400 shades (AA on `surface-base`).
   */
  tint: string
  /** Workspace-relative route segment of the list page ("plans"). */
  segment: string
  profile: Profile
  /** The three sentences that introduce the screen (see `ConceptExplain`). */
  explain: ConceptExplain
}

export const NOMENCLATURE: Record<ConceptKey, Concept> = {
  overview: {
    get singular() {
      return tr('nomenclature.overview.singular')
    },
    get plural() {
      return tr('nav.concepts.overview')
    },
    get description() {
      return tr('nomenclature.overview.description')
    },
    icon: Home,
    tint: '#818cf8',
    segment: 'overview',
    profile: 'all',
    explain: {
      get what() {
        return tr('nomenclature.overview.what')
      },
      get why() {
        return tr('nomenclature.overview.why')
      },
      get different() {
        return tr('nomenclature.overview.different')
      },
    },
  },
  projects: {
    get singular() {
      return tr('nomenclature.projects.singular')
    },
    get plural() {
      return tr('nav.concepts.projects')
    },
    get description() {
      return tr('nomenclature.projects.description')
    },
    icon: Box,
    tint: '#818cf8',
    segment: 'projects',
    profile: 'all',
    explain: {
      get what() {
        return tr('nomenclature.projects.what')
      },
      get why() {
        return tr('nomenclature.projects.why')
      },
      get different() {
        return tr('nomenclature.projects.different')
      },
    },
  },
  objectives: {
    get singular() {
      return tr('nomenclature.objectives.singular')
    },
    get plural() {
      return tr('nav.concepts.objectives')
    },
    get description() {
      return tr('nomenclature.objectives.description')
    },
    icon: Flag,
    tint: '#34d399',
    segment: 'milestones',
    profile: 'all',
    explain: {
      get what() {
        return tr('nomenclature.objectives.what')
      },
      get why() {
        return tr('nomenclature.objectives.why')
      },
      get different() {
        return tr('nomenclature.objectives.different')
      },
    },
  },
  plans: {
    get singular() {
      return tr('nomenclature.plans.singular')
    },
    get plural() {
      return tr('nav.concepts.plans')
    },
    get description() {
      return tr('nomenclature.plans.description')
    },
    icon: ClipboardList,
    tint: '#60a5fa',
    segment: 'plans',
    profile: 'all',
    explain: {
      get what() {
        return tr('nomenclature.plans.what')
      },
      get why() {
        return tr('nomenclature.plans.why')
      },
      get different() {
        return tr('nomenclature.plans.different')
      },
    },
  },
  tasks: {
    get singular() {
      return tr('nomenclature.tasks.singular')
    },
    get plural() {
      return tr('nav.concepts.tasks')
    },
    get description() {
      return tr('nomenclature.tasks.description')
    },
    icon: CheckSquare,
    tint: '#fbbf24',
    segment: 'tasks',
    profile: 'all',
    explain: {
      get what() {
        return tr('nomenclature.tasks.what')
      },
      get why() {
        return tr('nomenclature.tasks.why')
      },
      get different() {
        return tr('nomenclature.tasks.different')
      },
    },
  },
  automation: {
    get singular() {
      return tr('nomenclature.automation.singular')
    },
    get plural() {
      return tr('nav.concepts.automation')
    },
    get description() {
      return tr('nomenclature.automation.description')
    },
    icon: Activity,
    tint: '#fb923c',
    segment: 'pipelines',
    profile: 'all',
    explain: {
      get what() {
        return tr('nomenclature.automation.what')
      },
      get why() {
        return tr('nomenclature.automation.why')
      },
      get different() {
        return tr('nomenclature.automation.different')
      },
    },
  },
  triggers: {
    get singular() {
      return tr('nomenclature.triggers.singular')
    },
    get plural() {
      return tr('nav.concepts.triggers')
    },
    get description() {
      return tr('nomenclature.triggers.description')
    },
    icon: Zap,
    tint: '#fde047',
    segment: 'triggers',
    profile: 'all',
    explain: {
      get what() {
        return tr('nomenclature.triggers.what')
      },
      get why() {
        return tr('nomenclature.triggers.why')
      },
      get different() {
        return tr('nomenclature.triggers.different')
      },
    },
  },
  notes: {
    get singular() {
      return tr('nomenclature.notes.singular')
    },
    get plural() {
      return tr('nav.concepts.notes')
    },
    get description() {
      return tr('nomenclature.notes.description')
    },
    icon: FileText,
    tint: '#2dd4bf',
    segment: 'notes',
    profile: 'all',
    explain: {
      get what() {
        return tr('nomenclature.notes.what')
      },
      get why() {
        return tr('nomenclature.notes.why')
      },
      get different() {
        return tr('nomenclature.notes.different')
      },
    },
  },
  proposals: {
    get singular() {
      return tr('nomenclature.proposals.singular')
    },
    get plural() {
      return tr('nav.concepts.proposals')
    },
    get description() {
      return tr('nomenclature.proposals.description')
    },
    icon: ScrollText,
    tint: '#a78bfa',
    segment: 'rfcs',
    profile: 'all',
    explain: {
      get what() {
        return tr('nomenclature.proposals.what')
      },
      get why() {
        return tr('nomenclature.proposals.why')
      },
      get different() {
        return tr('nomenclature.proposals.different')
      },
    },
  },
  decisions: {
    get singular() {
      return tr('nomenclature.decisions.singular')
    },
    get plural() {
      return tr('nav.concepts.decisions')
    },
    get description() {
      return tr('nomenclature.decisions.description')
    },
    icon: Scale,
    tint: '#c084fc',
    segment: 'decisions',
    profile: 'all',
    explain: {
      get what() {
        return tr('nomenclature.decisions.what')
      },
      get why() {
        return tr('nomenclature.decisions.why')
      },
      get different() {
        return tr('nomenclature.decisions.different')
      },
    },
  },
  code: {
    get singular() {
      return tr('nomenclature.code.singular')
    },
    get plural() {
      return tr('nav.concepts.code')
    },
    get description() {
      return tr('nomenclature.code.description')
    },
    icon: Code,
    tint: '#94a3b8',
    segment: 'code',
    profile: 'software',
    explain: {
      get what() {
        return tr('nomenclature.code.what')
      },
      get why() {
        return tr('nomenclature.code.why')
      },
      get different() {
        return tr('nomenclature.code.different')
      },
    },
  },
  featureGraphs: {
    get singular() {
      return tr('nomenclature.featureGraphs.singular')
    },
    get plural() {
      return tr('nav.concepts.featureGraphs')
    },
    get description() {
      return tr('nomenclature.featureGraphs.description')
    },
    icon: Network,
    tint: '#f0abfc',
    segment: 'feature-graphs',
    profile: 'software',
    explain: {
      get what() {
        return tr('nomenclature.featureGraphs.what')
      },
      get why() {
        return tr('nomenclature.featureGraphs.why')
      },
      get different() {
        return tr('nomenclature.featureGraphs.different')
      },
    },
  },
  skills: {
    get singular() {
      return tr('nomenclature.skills.singular')
    },
    get plural() {
      return tr('nav.concepts.skills')
    },
    get description() {
      return tr('nomenclature.skills.description')
    },
    icon: Brain,
    tint: '#f472b6',
    segment: 'skills',
    profile: 'all',
    explain: {
      get what() {
        return tr('nomenclature.skills.what')
      },
      get why() {
        return tr('nomenclature.skills.why')
      },
      get different() {
        return tr('nomenclature.skills.different')
      },
    },
  },
  personas: {
    get singular() {
      return tr('nomenclature.personas.singular')
    },
    get plural() {
      return tr('nav.concepts.personas')
    },
    get description() {
      return tr('nomenclature.personas.description')
    },
    icon: Users,
    tint: '#e879f9',
    segment: 'personas',
    profile: 'all',
    explain: {
      get what() {
        return tr('nomenclature.personas.what')
      },
      get why() {
        return tr('nomenclature.personas.why')
      },
      get different() {
        return tr('nomenclature.personas.different')
      },
    },
  },
  protocols: {
    get singular() {
      return tr('nomenclature.protocols.singular')
    },
    get plural() {
      return tr('nav.concepts.protocols')
    },
    get description() {
      return tr('nomenclature.protocols.description')
    },
    icon: Workflow,
    tint: '#fb7185',
    segment: 'protocols',
    profile: 'all',
    explain: {
      get what() {
        return tr('nomenclature.protocols.what')
      },
      get why() {
        return tr('nomenclature.protocols.why')
      },
      get different() {
        return tr('nomenclature.protocols.different')
      },
    },
  },
  neuralRouting: {
    get singular() {
      return tr('nomenclature.neuralRouting.singular')
    },
    get plural() {
      return tr('nav.concepts.neuralRouting')
    },
    get description() {
      return tr('nomenclature.neuralRouting.description')
    },
    icon: Route,
    tint: '#f9a8d4',
    segment: 'neural-routing',
    profile: 'all',
    explain: {
      get what() {
        return tr('nomenclature.neuralRouting.what')
      },
      get why() {
        return tr('nomenclature.neuralRouting.why')
      },
      get different() {
        return tr('nomenclature.neuralRouting.different')
      },
    },
  },
  sharing: {
    get singular() {
      return tr('nomenclature.sharing.singular')
    },
    get plural() {
      return tr('nav.concepts.sharing')
    },
    get description() {
      return tr('nomenclature.sharing.description')
    },
    icon: Share2,
    tint: '#a3e635',
    segment: 'sharing',
    profile: 'all',
    explain: {
      get what() {
        return tr('nomenclature.sharing.what')
      },
      get why() {
        return tr('nomenclature.sharing.why')
      },
      get different() {
        return tr('nomenclature.sharing.different')
      },
    },
  },
  mcpFederation: {
    get singular() {
      return tr('nomenclature.mcpFederation.singular')
    },
    get plural() {
      return tr('nav.concepts.mcpFederation')
    },
    get description() {
      return tr('nomenclature.mcpFederation.description')
    },
    icon: Plug,
    tint: '#38bdf8',
    segment: 'mcp-federation',
    profile: 'all',
    explain: {
      get what() {
        return tr('nomenclature.mcpFederation.what')
      },
      get why() {
        return tr('nomenclature.mcpFederation.why')
      },
      get different() {
        return tr('nomenclature.mcpFederation.different')
      },
    },
  },
  admin: {
    get singular() {
      return tr('nomenclature.admin.singular')
    },
    get plural() {
      return tr('nav.concepts.admin')
    },
    get description() {
      return tr('nomenclature.admin.description')
    },
    icon: Settings,
    tint: '#94a3b8',
    segment: 'admin',
    profile: 'all',
    explain: {
      get what() {
        return tr('nomenclature.admin.what')
      },
      get why() {
        return tr('nomenclature.admin.why')
      },
      get different() {
        return tr('nomenclature.admin.different')
      },
    },
  },
  insights: {
    get singular() {
      return tr('nomenclature.insights.singular')
    },
    get plural() {
      return tr('nomenclature.insights.plural')
    },
    get description() {
      return tr('nomenclature.insights.description')
    },
    icon: Lightbulb,
    tint: '#818cf8',
    segment: 'intelligence',
    profile: 'all',
    explain: {
      get what() {
        return tr('nomenclature.insights.what')
      },
      get why() {
        return tr('nomenclature.insights.why')
      },
      get different() {
        return tr('nomenclature.insights.different')
      },
    },
  },
  today: {
    get singular() {
      return tr('nomenclature.today.singular')
    },
    get plural() {
      return tr('nomenclature.today.plural')
    },
    get description() {
      return tr('nomenclature.today.description')
    },
    icon: Sun,
    tint: '#818cf8',
    segment: 'today',
    profile: 'all',
    explain: {
      get what() {
        return tr('nomenclature.today.what')
      },
      get why() {
        return tr('nomenclature.today.why')
      },
      get different() {
        return tr('nomenclature.today.different')
      },
    },
  },
  trajectory: {
    get singular() {
      return tr('nomenclature.trajectory.singular')
    },
    get plural() {
      return tr('nav.concepts.trajectory')
    },
    get description() {
      return tr('nomenclature.trajectory.description')
    },
    icon: GitBranch,
    tint: '#6ee7b7',
    segment: 'trajectory',
    profile: 'all',
    explain: {
      get what() {
        return tr('nomenclature.trajectory.what')
      },
      get why() {
        return tr('nomenclature.trajectory.why')
      },
      get different() {
        return tr('nomenclature.trajectory.different')
      },
    },
  },
  architecture: {
    get singular() {
      return tr('nomenclature.architecture.singular')
    },
    get plural() {
      return tr('nav.concepts.architecture')
    },
    get description() {
      return tr('nomenclature.architecture.description')
    },
    icon: Blocks,
    tint: '#94a3b8',
    segment: 'architecture',
    profile: 'software',
    explain: {
      get what() {
        return tr('nomenclature.architecture.what')
      },
      get why() {
        return tr('nomenclature.architecture.why')
      },
      get different() {
        return tr('nomenclature.architecture.different')
      },
    },
  },
  deployments: {
    get singular() {
      return tr('nomenclature.deployments.singular')
    },
    get plural() {
      return tr('nav.concepts.deployments')
    },
    get description() {
      return tr('nomenclature.deployments.description')
    },
    icon: Rocket,
    tint: '#cbd5e1',
    segment: 'deployments',
    profile: 'software',
    explain: {
      get what() {
        return tr('nomenclature.deployments.what')
      },
      get why() {
        return tr('nomenclature.deployments.why')
      },
      get different() {
        return tr('nomenclature.deployments.different')
      },
    },
  },
  documents: {
    get singular() {
      return tr('nomenclature.documents.singular')
    },
    get plural() {
      return tr('nav.concepts.documents')
    },
    get description() {
      return tr('nomenclature.documents.description')
    },
    icon: Files,
    tint: '#22d3ee',
    segment: 'documents',
    profile: 'all',
    explain: {
      get what() {
        return tr('nomenclature.documents.what')
      },
      get why() {
        return tr('nomenclature.documents.why')
      },
      get different() {
        return tr('nomenclature.documents.different')
      },
    },
  },
  workspaces: {
    get singular() {
      return tr('nomenclature.workspaces.singular')
    },
    get plural() {
      return tr('nomenclature.workspaces.plural')
    },
    get description() {
      return tr('nomenclature.workspaces.description')
    },
    icon: Layers,
    tint: '#a8a29e',
    segment: 'workspaces',
    profile: 'all',
    explain: {
      get what() {
        return tr('nomenclature.workspaces.what')
      },
      get why() {
        return tr('nomenclature.workspaces.why')
      },
      get different() {
        return tr('nomenclature.workspaces.different')
      },
    },
  },
}

/**
 * Application-level chrome (above the workspaces). Today is the root of the
 * application, not an entry of a workspace's sidebar: it is NOT in NAV_GROUPS.
 */
/** Concepts shown as CARDS (a grid or a Kanban), each with its own tint: they must stay visibly different from one another. */
export const CARD_CONCEPTS: readonly ConceptKey[] = [
  'projects', 'objectives', 'plans', 'tasks', 'automation', 'triggers', 'notes', 'proposals', 'decisions',
  'documents', 'skills', 'personas', 'protocols', 'sharing', 'mcpFederation', 'deployments', 'workspaces',
]

/** The tint of a concept, as the CSS variable every card recipe reads (`--entity-tint`). */
export function tintStyle(key: ConceptKey): { '--entity-tint': string } {
  return { '--entity-tint': NOMENCLATURE[key].tint }
}

export const NAV_TEXT = {
  /** Section of the global sidebar that lists the workspaces. */
  workspaces: 'Workspaces',
  allWorkspaces: 'All workspaces',
  newWorkspace: 'New workspace',
  /** Noun after the count of the badge on Today: « 3 requests waiting for you ». */
  attentionOne: 'request waiting for you',
  attentionMany: 'requests waiting for you',
} as const

/**
 * The words of Today that name a concept (the four bands, the assistants), lifted out of
 * `components/today/*` so the marketing site can import them instead of retyping them
 * (website/AUDIENCE.md § 7 point 3). English source; translations live under `nav.today.*`
 * (13 languages). The Today components still carry their own copy: they read these keys at merge
 * time, see the hand-off list in the PR description.
 */
export const TODAY_WORDS = {
  assistants: 'Assistants',
  bands: {
    waiting: { title: 'Waiting for you', summary: 'waiting for you', empty: 'Nobody is waiting for your answer' },
    running: { title: 'In progress', summary: 'in progress', empty: 'No plan is in progress' },
    stuck: { title: 'To resume', summary: 'to resume', empty: 'Nothing to resume' },
    thinking: { title: 'To read', summary: 'to read', empty: 'Nothing to read' },
  },
} as const

/**
 * Sidebar structure of ONE workspace. A group reads as a stage of the person's work (what I do, what
 * the project remembers, who works for me, the code, the plumbing), not as a data type. Four groups are
 * visible; `system` is folded. Modelled on the pillars of the site (website/src/i18n/messages/en/features.ts).
 */
export interface NavGroup {
  /** Key of the translated label (`nav.groups.<id>`); `label` stays the English source. */
  id: 'work' | 'memory' | 'assistants' | 'code' | 'system'
  label: string
  items: ConceptKey[]
  /** Folded until the person opens it (or until the current page lives inside it). */
  collapsed?: boolean
}

export const NAV_GROUPS: NavGroup[] = [
  { id: 'work', label: 'Work', items: ['overview', 'trajectory', 'projects', 'objectives', 'plans', 'tasks'] },
  { id: 'memory', label: 'Memory', items: ['notes', 'decisions', 'proposals', 'documents'] },
  { id: 'assistants', label: 'Assistants', items: ['automation', 'triggers', 'personas', 'skills', 'protocols'] },
  { id: 'code', label: 'Code', items: ['code', 'featureGraphs', 'architecture', 'deployments'] },
  { id: 'system', label: 'System', items: ['sharing', 'mcpFederation', 'neuralRouting', 'admin'], collapsed: true },
]

/** Workspace-relative segment → concept, for the breadcrumb. */
const BY_SEGMENT: Record<string, Concept> = Object.fromEntries(
  Object.values(NOMENCLATURE).map((c) => [c.segment, c]),
)

/** Segments that are not a list page of their own but still deserve a name. */
const EXTRA_SEGMENTS: Record<string, () => string> = {
  'project-milestones': () => NOMENCLATURE.objectives.plural,
  runner: () => tr('nomenclature.segment.runner'),
  graph: () => tr('nomenclature.segment.graph'),
  'vector-space': () => tr('nomenclature.segment.vectorSpace'),
  chat: () => tr('nomenclature.segment.chat'),
  timeline: () => tr('nomenclature.segment.timeline'),
}

/** Display name for a URL segment, or null when it is an identifier. */
export function segmentLabel(segment: string): string | null {
  return BY_SEGMENT[segment]?.plural ?? EXTRA_SEGMENTS[segment]?.() ?? null
}

/** Fallback name of an entity page whose list segment is unknown ("Details"). */
export function detailsLabel(): string {
  return tr('nomenclature.segment.details')
}

/** Singular noun for the entity that lives under a list segment ("plans" → "Plan"). */
export function entityNoun(listSegment: string): string | null {
  if (listSegment === 'project-milestones') return NOMENCLATURE.objectives.singular
  return BY_SEGMENT[listSegment]?.singular ?? null
}
