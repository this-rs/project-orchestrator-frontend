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
 * i18n after #252: these strings are the English source; when the i18n layer lands they
 * move under `nomenclature.<key>.explain.*`. Until then they live here, like every label.
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
    singular: 'Overview',
    plural: 'Overview',
    description: 'Where the workspace stands right now.',
    icon: Home,
    tint: '#818cf8',
    segment: 'overview',
    profile: 'all',
    explain: {
      what: 'Where the workspace stands right now: its projects, what moves and what waits.',
      why: 'You see in one glance which project needs you before you open anything.',
      different: 'Today you open each project in turn to know where it stands. Here they are read together.',
    },
  },
  projects: {
    singular: 'Project',
    plural: 'Projects',
    description: 'A body of work with its own plans, notes and decisions.',
    icon: Box,
    tint: '#818cf8',
    segment: 'projects',
    profile: 'all',
    explain: {
      what: 'A project is a body of work with its own plans, notes, decisions and documents.',
      why: 'Everything about one piece of work stays together, with or without code.',
      different: 'Today a project lives in several tools at once. Here one project is one place.',
    },
  },
  objectives: {
    singular: 'Objective',
    plural: 'Objectives',
    description: 'What the work is heading toward.',
    icon: Flag,
    tint: '#34d399',
    segment: 'milestones',
    profile: 'all',
    explain: {
      what: 'An objective is what the work is heading toward.',
      why: 'You know what each plan serves, and how far along the objective is.',
      different: 'Today a goal lives in a document nobody reopens. Here it is tied to the plans that advance it.',
    },
  },
  plans: {
    singular: 'Plan',
    plural: 'Plans',
    description: 'How an objective gets done: ordered tasks and steps.',
    icon: ClipboardList,
    tint: '#60a5fa',
    segment: 'plans',
    profile: 'all',
    explain: {
      what: 'A plan says how an objective gets done, as ordered tasks and steps.',
      why: 'You see what is done, what is blocked and what comes next.',
      different: 'Today a plan is a list you keep by hand. Here each task knows what it depends on, and the progress adds itself up.',
    },
  },
  tasks: {
    singular: 'Task',
    plural: 'Tasks',
    description: 'A unit of work inside a plan.',
    icon: CheckSquare,
    tint: '#fbbf24',
    segment: 'tasks',
    profile: 'all',
    explain: {
      what: 'A task is one unit of work inside a plan, with its steps.',
      why: 'You see every task across your plans, with its status and who holds it.',
      different: 'Today a task is a line in a list, with no memory. Here it keeps its steps, its notes and what was decided for it.',
    },
  },
  automation: {
    singular: 'Automation',
    plural: 'Automation',
    description: 'Runs of your assistants across plans, and what starts them.',
    icon: Activity,
    tint: '#fb923c',
    segment: 'pipelines',
    profile: 'all',
    explain: {
      what: 'Automation is the runs of your assistants across plans, and what started them.',
      why: 'You follow what advances on its own, and you can stop a run at any time.',
      different: 'Today you keep each conversation open to watch it work. Here the runs are listed with their status, past and present.',
    },
  },
  triggers: {
    singular: 'Trigger',
    plural: 'Triggers',
    description: 'Events and schedules that start an automated run.',
    icon: Zap,
    tint: '#fde047',
    segment: 'triggers',
    profile: 'all',
    explain: {
      what: 'A trigger is an event or a schedule that starts a run on its own.',
      why: 'Work starts at the right moment, with nobody at the keyboard.',
      different: 'Today you remember to launch things by hand. Here the moment is set once and kept.',
    },
  },
  notes: {
    singular: 'Note',
    plural: 'Notes',
    description: 'What was learned: guidelines, gotchas, patterns, tips.',
    icon: FileText,
    tint: '#2dd4bf',
    segment: 'notes',
    profile: 'all',
    explain: {
      what: 'Notes are what was learned: guidelines, pitfalls, patterns, tips.',
      why: 'Assistants read them before they start, so the project remembers what you know.',
      different: 'Today you paste your notes into each new conversation. Here they stay with the project.',
    },
  },
  proposals: {
    singular: 'Proposal',
    plural: 'Proposals',
    description: 'A change put up for review before it is decided.',
    icon: ScrollText,
    tint: '#a78bfa',
    segment: 'rfcs',
    profile: 'all',
    explain: {
      what: 'A proposal is a change put up for review before it is decided.',
      why: 'You see what is being suggested, and you accept or reject it with the reasons on record.',
      different: 'Today a suggestion is a message that gets lost in a thread. Here it waits for your answer, and the answer stays.',
    },
  },
  decisions: {
    singular: 'Decision',
    plural: 'Decisions',
    description: 'A choice that was made, with its rationale and alternatives.',
    icon: Scale,
    tint: '#c084fc',
    segment: 'decisions',
    profile: 'all',
    explain: {
      what: 'A decision is a choice that was made, with its reason and the alternatives set aside.',
      why: 'Anyone, and any assistant, can see why things are the way they are.',
      different: 'Today the reason for a choice lives in someone\'s head. Here it stays with the project, and is replaced when it changes.',
    },
  },
  code: {
    singular: 'Code',
    plural: 'Code',
    description: 'Files, functions and how they call each other.',
    icon: Code,
    tint: '#94a3b8',
    segment: 'code',
    profile: 'software',
    explain: {
      what: 'Code is the files of a project, the functions and types inside them, and how they call each other.',
      why: 'You find who calls a function and what a change would affect.',
      different: 'Today you search text across files. Here the code is read as a structure, not as lines.',
    },
  },
  featureGraphs: {
    singular: 'Feature graph',
    plural: 'Feature graphs',
    description: 'The code that makes up one feature.',
    icon: Network,
    tint: '#f0abfc',
    segment: 'feature-graphs',
    profile: 'software',
    explain: {
      what: 'The pieces of code that together make one feature, gathered in one place.',
      why: 'You read one feature without hunting through the whole codebase.',
      different: 'Today a feature is spread across files you keep in your head. Here it is one named set you can open.',
    },
  },
  skills: {
    singular: 'Skill',
    plural: 'Skills',
    description: 'Groups of related notes that an assistant switches on by itself.',
    icon: Brain,
    tint: '#f472b6',
    segment: 'skills',
    profile: 'all',
    explain: {
      what: 'A skill is a group of related notes that an assistant switches on by itself when the topic comes up.',
      why: 'The right knowledge is there when it matters, without you looking for it.',
      different: 'Today you tell the assistant what to remember, every time. Here the knowledge wakes up on its own.',
    },
  },
  personas: {
    singular: 'Persona',
    plural: 'Personas',
    description: 'An assistant specialised in one area of the work.',
    icon: Users,
    tint: '#e879f9',
    segment: 'personas',
    profile: 'all',
    explain: {
      what: 'A persona is an assistant specialised in one area of your work.',
      why: 'The task goes to the assistant that knows its area, with its own limits of time, cost and model.',
      different: 'Today one general assistant does everything. Here each area has its specialist.',
    },
  },
  protocols: {
    singular: 'Protocol',
    plural: 'Protocols',
    description: 'A repeatable procedure an assistant follows step by step.',
    icon: Workflow,
    tint: '#fb7185',
    segment: 'protocols',
    profile: 'all',
    explain: {
      what: 'A protocol is a procedure with a start, steps and an end, that an assistant follows in order.',
      why: 'A procedure runs the same way every time, and each run is recorded.',
      different: 'Today a procedure is a checklist you hope was followed. Here each step is checked before the next one.',
    },
  },
  neuralRouting: {
    singular: 'Neural routing',
    plural: 'Neural routing',
    description: 'How a question finds the notes and decisions that answer it.',
    icon: Route,
    tint: '#f9a8d4',
    segment: 'neural-routing',
    profile: 'all',
    explain: {
      what: 'How a question finds the notes and decisions that answer it.',
      why: 'You see which knowledge an assistant will lean on, and why.',
      different: 'Today a search matches words. Here the ideas that are used together are found together.',
    },
  },
  sharing: {
    singular: 'Sharing',
    plural: 'Sharing & privacy',
    description: 'What may leave this workspace, under which policy, and the secrets assistants may use.',
    icon: Share2,
    tint: '#a3e635',
    segment: 'sharing',
    profile: 'all',
    explain: {
      what: 'Sharing is what may leave this workspace, under which policy, and the secrets assistants may use.',
      why: 'Nothing leaves without your approval, and a copy given away can be taken back.',
      different: 'Today you copy things by hand and lose track of them. Here each share has an owner, an expiry and a record.',
    },
  },
  mcpFederation: {
    singular: 'MCP server',
    plural: 'MCP federation',
    description: 'Outside tools that your assistants can call.',
    icon: Plug,
    tint: '#38bdf8',
    segment: 'mcp-federation',
    profile: 'all',
    explain: {
      what: 'Connections to outside tools that your assistants can call from here.',
      why: 'An assistant reaches the tools of your other systems without leaving the project.',
      different: 'Today each tool lives in its own window. Here they are declared once and reached from the work.',
    },
  },
  admin: {
    singular: 'Administration',
    plural: 'Administration',
    description: 'Indexing, search and maintenance of the workspace.',
    icon: Settings,
    tint: '#94a3b8',
    segment: 'admin',
    profile: 'all',
    explain: {
      what: 'Administration is the indexing, search and maintenance of the workspace.',
      why: 'You check that everything is up to date, and start a re-index when needed.',
      different: 'Today upkeep means commands you look up. Here it is one screen with a button for each.',
    },
  },
  insights: {
    singular: 'Insights',
    plural: 'Insights',
    description: 'Health and structure metrics of one project.',
    icon: Lightbulb,
    tint: '#818cf8',
    segment: 'intelligence',
    profile: 'all',
    explain: {
      what: 'Insights are the health and structure measures of one project.',
      why: 'You see where a project is fragile before it slows you down.',
      different: 'Today you feel a project\'s health through its bugs. Here it is measured and named.',
    },
  },
  today: {
    singular: 'Today',
    plural: 'Today',
    description: 'Everything in progress, and what to start with.',
    icon: Sun,
    tint: '#818cf8',
    segment: 'today',
    profile: 'all',
    explain: {
      what: 'Today is everything that is in progress, and what to start with.',
      why: 'You know in one sentence what waits for your answer, what to resume, and what moves on its own.',
      different: 'Today you check each conversation in turn. Here the day is read for you, oldest request first.',
    },
  },
  trajectory: {
    singular: 'Trajectory',
    plural: 'Trajectory',
    description: 'What is in progress toward your objectives, and the path travelled.',
    icon: GitBranch,
    tint: '#6ee7b7',
    segment: 'trajectory',
    profile: 'all',
    explain: {
      what: 'Trajectory is what is in progress toward your objectives, and the path travelled.',
      why: 'You see where the work is going, and what it took to get here.',
      different: 'Today progress is a feeling. Here it is the chain of what was done, decided and shipped.',
    },
  },
  architecture: {
    singular: 'Architecture',
    plural: 'Architecture',
    description: 'The system as built: components and what depends on what.',
    icon: Blocks,
    tint: '#94a3b8',
    segment: 'architecture',
    profile: 'software',
    explain: {
      what: 'Architecture is the system as built: its components and what depends on what.',
      why: 'You see what a change would touch before you make it.',
      different: 'Today the architecture is a diagram that goes stale. Here it is read from the code itself.',
    },
  },
  deployments: {
    singular: 'Deployment',
    plural: 'Deployments',
    description: 'Where each project runs and what was shipped there.',
    icon: Rocket,
    tint: '#cbd5e1',
    segment: 'deployments',
    profile: 'software',
    explain: {
      what: 'A deployment is where a project runs, and what was shipped there.',
      why: 'You know which version runs where, and when it got there.',
      different: 'Today you ask around to learn what is live. Here each environment keeps its history.',
    },
  },
  documents: {
    singular: 'Document',
    plural: 'Documents',
    description: 'Spreadsheets, decks and files attached to your work.',
    icon: Files,
    tint: '#22d3ee',
    segment: 'documents',
    profile: 'all',
    explain: {
      what: 'Documents are the spreadsheets, decks and files attached to your work.',
      why: 'Assistants read their text, and you open the original again whenever you need it.',
      different: 'Today your files sit in a folder, apart from the work. Here they are filed with the project, and the original stays with you.',
    },
  },
  workspaces: {
    singular: 'Workspace',
    plural: 'Workspaces',
    description: 'Several projects that share a context and objectives.',
    icon: Layers,
    tint: '#a8a29e',
    segment: 'workspaces',
    profile: 'all',
    explain: {
      what: 'A workspace groups several of your projects that share a context and objectives.',
      why: 'You open one workspace and see its projects, plans, notes and decisions together.',
      different: 'Today each project is a separate folder. Here the projects of a workspace share what was decided.',
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
