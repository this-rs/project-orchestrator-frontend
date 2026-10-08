/**
 * The words of the chat's first screen, and its suggestions by project profile.
 *
 * A suggestion has a label (what the person reads), a hint, and the prompt the
 * assistant receives — more precise than the label when that helps. The sets:
 * a project without code, or none, gets the work of everyday life (website:
 * « Prepare the funding application », « Budget Q4 », « Resume what stopped »);
 * a codebase gets the three code questions on top of the common ones
 * (website/AUDIENCE.md § 2 for the words, § 6 for the gap this closes).
 *
 * English for now; these strings move to `src/i18n` once #252 is merged.
 */
import type { LucideIcon } from 'lucide-react'
import { Play, Lightbulb, Zap, Building, Search, BarChart3, CalendarCheck, ListChecks, RotateCcw, Scale } from 'lucide-react'
import { NOMENCLATURE } from '@/constants/nomenclature'
import type { ProjectProfile } from '@/types'

export const WELCOME_TEXT = {
  title: 'What would you like to do?',
  lead: 'Hand the work to an assistant. What it plans, decides and asks you stays here.',
  suggestions: 'Suggestions',
  /** Shown under the suggestions when no project is selected. */
  noProject: 'Choose a project above for answers about one piece of work.',
  status: 'Where things stand',
  toReview: 'to review',
  allClear: 'Nothing to review',
  synced: 'synced ',
  recent: 'Recent conversations',
  untitledConversation: 'Untitled conversation',
  untitledPlan: 'Untitled',
} as const

export interface Suggestion {
  id: string
  /** What the person reads. */
  label: string
  /** One short line under the label. */
  hint: string
  /** What the assistant receives — may be more precise than the label. */
  prompt: string
  /** Cursor position from the end of the prompt (0 = the person completes the sentence). */
  cursorOffset?: number
  icon: LucideIcon
}

const decided = NOMENCLATURE.decisions.plural.toLowerCase()

const SUGGESTIONS = {
  next: {
    id: 'next',
    label: "What's next?",
    hint: 'The next task to pick up',
    prompt: 'What is the next available task on the active plan? Show me its context and steps.',
    icon: Play,
  },
  plan: {
    id: 'plan',
    label: 'Plan something',
    hint: 'Turn a goal into tasks',
    prompt: 'Plan the work for: ',
    cursorOffset: 0,
    icon: Lightbulb,
  },
  prepare: {
    id: 'prepare',
    label: 'Prepare something',
    hint: 'An event, a file, a launch',
    prompt: 'Help me prepare the following, as a plan of tasks with what depends on what: ',
    cursorOffset: 0,
    icon: CalendarCheck,
  },
  track: {
    id: 'track',
    label: 'Keep track of something',
    hint: 'A budget, a schedule, a list',
    prompt:
      'Set up a way to keep track of the following: a plan with its tasks, notes for what I tell you, and a decision each time I choose. Here is what to track: ',
    cursorOffset: 0,
    icon: ListChecks,
  },
  resume: {
    id: 'resume',
    label: 'Resume what stopped',
    hint: 'Pick up work that is waiting',
    prompt: 'What has stopped or is waiting on me? List it, then resume the first item.',
    icon: RotateCcw,
  },
  decided: {
    id: 'decided',
    label: 'What did we decide?',
    hint: `${NOMENCLATURE.decisions.plural} and their reasons`,
    prompt: `What have we decided so far, and why? List the ${decided} with their reasons and the alternatives set aside.`,
    icon: Scale,
  },
  standing: {
    id: 'standing',
    label: 'Where do we stand?',
    hint: `${NOMENCLATURE.objectives.plural}, ${NOMENCLATURE.plans.plural.toLowerCase()}, progress`,
    prompt: 'Show me where we stand: objectives, plans, what is done and what comes next.',
    icon: BarChart3,
  },
  impact: {
    id: 'impact',
    label: 'What breaks if I change…',
    hint: 'What a change touches',
    prompt: 'Analyze the impact of changing: ',
    cursorOffset: 0,
    icon: Zap,
  },
  where: {
    id: 'where',
    label: 'Where is … handled?',
    hint: 'Find the code behind a behaviour',
    prompt: 'Search the code for where this is handled: ',
    cursorOffset: 0,
    icon: Search,
  },
  architecture: {
    id: 'architecture',
    label: 'Draw the architecture',
    hint: 'The main parts and how they connect',
    prompt: 'Give me an overview of the project architecture: the main parts and how they connect.',
    icon: Building,
  },
} as const satisfies Record<string, Suggestion>

/** No project, or a project without code: the work of everyday life. */
const WORK_SUGGESTIONS: readonly Suggestion[] = [
  SUGGESTIONS.prepare,
  SUGGESTIONS.track,
  SUGGESTIONS.resume,
  SUGGESTIONS.decided,
  SUGGESTIONS.next,
  SUGGESTIONS.standing,
]

/** A codebase: the common questions, then the three that need code. */
const SOFTWARE_SUGGESTIONS: readonly Suggestion[] = [
  SUGGESTIONS.next,
  SUGGESTIONS.plan,
  SUGGESTIONS.impact,
  SUGGESTIONS.where,
  SUGGESTIONS.architecture,
  SUGGESTIONS.decided,
]

/** The suggestions for a profile; `null` is « no project selected » and reads like a project without code. */
export function suggestionsFor(profile: ProjectProfile | null): readonly Suggestion[] {
  return profile === 'software' ? SOFTWARE_SUGGESTIONS : WORK_SUGGESTIONS
}
