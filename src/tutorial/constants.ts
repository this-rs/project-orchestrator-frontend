import {
  Compass,
  MessageCircle,
  ClipboardList,
  Columns3,
  CheckSquare,
  BookOpen,
  Terminal,
  FolderGit2,
  Layers,
  Flag,
  type LucideIcon,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Tour name constants
// ---------------------------------------------------------------------------

export const TOUR_NAMES = {
  MAIN: 'main-tour',
  CHAT: 'chat',
  PLAN_LIST: 'plan-list',
  PLAN_DETAIL: 'plan-detail',
  KANBAN: 'kanban',
  TASK_DETAIL: 'task-detail',
  NOTES: 'notes',
  CODE: 'code-explorer',
  PROJECT_DETAIL: 'project-detail',
  WORKSPACE_DETAIL: 'workspace-detail',
  MILESTONES: 'milestones',
} as const

export type TourName = (typeof TOUR_NAMES)[keyof typeof TOUR_NAMES]

// ---------------------------------------------------------------------------
// Tutorial state (persisted in localStorage via Jotai atomWithStorage)
// ---------------------------------------------------------------------------

export interface TourState {
  completed: boolean
  completedAt: string | null
  skippedAt: string | null
}

export interface TutorialState {
  tours: Record<string, TourState>
  dismissed: Record<string, boolean>
}

export const DEFAULT_TUTORIAL_STATE: TutorialState = {
  tours: {},
  dismissed: {},
}

// ---------------------------------------------------------------------------
// Display metadata — French labels + icons
// ---------------------------------------------------------------------------

export const TOUR_DISPLAY_NAMES: Record<TourName, string> = {
  'main-tour': 'Tour principal',
  chat: 'Chat IA',
  'plan-list': 'Plans de developpement',
  'plan-detail': "Detail d'un plan",
  kanban: 'Vue Kanban',
  'task-detail': "Detail d'une tache",
  notes: 'Base de connaissances',
  'code-explorer': 'Exploration de code',
  'project-detail': "Detail d'un projet",
  'workspace-detail': "Detail d'un workspace",
  milestones: 'Milestones',
}

export const TOUR_ICONS: Record<TourName, LucideIcon> = {
  'main-tour': Compass,
  chat: MessageCircle,
  'plan-list': ClipboardList,
  'plan-detail': ClipboardList,
  kanban: Columns3,
  'task-detail': CheckSquare,
  notes: BookOpen,
  'code-explorer': Terminal,
  'project-detail': FolderGit2,
  'workspace-detail': Layers,
  milestones: Flag,
}

/** All tour names as an ordered array (main tour first, then alphabetical) */
export const ALL_TOUR_NAMES: TourName[] = [
  TOUR_NAMES.MAIN,
  TOUR_NAMES.CHAT,
  TOUR_NAMES.PLAN_LIST,
  TOUR_NAMES.PLAN_DETAIL,
  TOUR_NAMES.KANBAN,
  TOUR_NAMES.TASK_DETAIL,
  TOUR_NAMES.NOTES,
  TOUR_NAMES.CODE,
  TOUR_NAMES.PROJECT_DETAIL,
  TOUR_NAMES.WORKSPACE_DETAIL,
  TOUR_NAMES.MILESTONES,
]

// ---------------------------------------------------------------------------
// Auto-suggestion timing
// ---------------------------------------------------------------------------

/** Delay before showing a tour suggestion toast (ms) */
export const SUGGESTION_DELAY = 1500

/** Auto-hide the suggestion toast after this delay (ms) */
export const SUGGESTION_AUTO_HIDE = 8000

// ---------------------------------------------------------------------------
// Route-to-tour mapping (used by useTourSuggestion)
// ---------------------------------------------------------------------------

export const ROUTE_TO_TOUR: Record<string, TourName> = {
  '/chat': 'chat',
  '/plans': 'plan-list',
  '/plans/:id': 'plan-detail',
  '/plans/:id/kanban': 'kanban',
  '/tasks/:id': 'task-detail',
  '/notes': 'notes',
  '/code': 'code-explorer',
  '/projects/:slug': 'project-detail',
  '/workspaces/:slug': 'workspace-detail',
  '/milestones': 'milestones',
}
