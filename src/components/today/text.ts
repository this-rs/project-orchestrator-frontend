import type { Band, StuckReason, ThinkingKind, WavePointStatus } from '@/types/attention'
import type { LiveAgentState } from '@/types/liveAgents'
import { NOMENCLATURE } from '@/constants/nomenclature'

/**
 * Every visible word of Today, in ONE registry, in English — the language of the rest of the
 * UI and of `@/constants/nomenclature` (DESIGN.md § 0 « The words of Today are concepts too »).
 *
 * i18n after #252: these strings are the English source. When the i18n layer lands (PR #252),
 * each key moves under the catalogue as `today.<section>.<key>`; the keys below are stable so
 * that move is mechanical. Until then, nothing here is typed twice: `bands.ts`, `live/text.ts`
 * and `work/text.ts` re-export their slices of this object, and the marketing site imports the
 * same words instead of retyping them (website/AUDIENCE.md § 7).
 *
 * Vocabulary (website/AUDIENCE.md § 2): Assistants, Objectives, Plans, Tasks, Proposals — never
 * « agent », « milestone », « RFC », never « runner », « CLI » or « run » as a noun. Plain words:
 * a reader who knows nothing of the product must understand every line.
 */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export const TEXT = {
  /** The page: title, filter, states of the whole view. */
  today: {
    title: 'Today',
    summaryLabel: 'Summary of the day',
    laneFilterLabel: 'Filter by workspace',
    allLanes: 'All',
    laneNote: (name: string) => `Filtered on ${name}. The badge in the header counts every workspace.`,
    bandError: 'This section could not be loaded.',
    retry: 'Try again',
    staleRefresh: 'Refresh failed: what is shown may be out of date.',
    emptyAll: 'Nothing is waiting for you',
    emptyAllHint: 'No assistant is asking for your answer, no plan is in progress or to resume.',
    plans: 'See the plans',
    createWorkspace: 'Choose or create a workspace',
    noMatch: 'Nothing in this workspace',
    noMatchHint: 'This workspace has nothing waiting for you, nothing in progress, nothing to resume.',
    clearFilter: 'Clear the filter',
    loading: 'Loading',
    /** Name of the region holding the user's own day (day plan and tasks). */
    dayRegion: 'My day and my tasks',
    /** Accessible names of the three lists. */
    waitingList: 'Requests waiting for you',
    stuckList: 'Work to resume',
    runningList: 'Plans in progress',
    resumeFailed: 'Resume failed',
    /** The ring of the header: every task of every plan on the page. */
    overview: {
      tasksDone: 'tasks done',
      onPlans: (n: number) => `across ${plural(n, 'plan', 'plans')} followed here`,
    },
  },

  /** The four bands: section title, its one-line empty state, the counter's noun and its hint. */
  bands: {
    waiting: { title: 'Waiting for you', empty: 'Nobody is waiting for your answer', summary: 'waiting for you', hint: 'an assistant is waiting for your answer' },
    running: { title: 'In progress', empty: 'No plan is in progress', summary: 'in progress', hint: 'plans moving on their own' },
    stuck: { title: 'To resume', empty: 'Nothing to resume', summary: 'to resume', hint: 'stopped work' },
    thinking: { title: 'To read', empty: 'Nothing to read', summary: 'to read', hint: 'proposals, decisions, notes' },
  } satisfies Record<Band, { title: string; empty: string; summary: string; hint: string }>,

  /** What a stuck thread says about itself, in plain words. */
  stuckLabel: {
    failed: 'Stopped on an error',
    budget_exceeded: 'Budget exceeded',
    task_blocked: 'Task blocked',
    session_error: 'Conversation error',
    orphan_request: 'Request left unanswered',
  } satisfies Record<StuckReason, string>,

  /** One task of a plan, by state: singular and plural of the phrase after a number ("5 done"). */
  states: {
    done: { one: 'done', many: 'done' },
    running: { one: 'in progress', many: 'in progress' },
    waiting: { one: 'is waiting for your answer', many: 'are waiting for your answer' },
    pending: { one: 'to come', many: 'to come' },
    blocked: { one: 'blocked', many: 'blocked' },
    failed: { one: 'failed', many: 'failed' },
  } satisfies Record<WavePointStatus, { one: string; many: string }>,

  /** Age in words: "under a minute", "12 min", "7 h", "3 d". */
  age: {
    lessThanMinute: 'under a minute',
    minutes: (n: number) => `${n} min`,
    hours: (n: number) => `${n} h`,
    days: (n: number) => `${n} d`,
  },

  /** The day in ONE sentence (startHere.ts): the headline and the reason under it. */
  headline: {
    waitingTitle: (n: number) => (n === 1 ? 'An assistant is waiting for your answer' : `${n} assistants are waiting for your answer`),
    waitingWhy: (n: number, age: string) => `${n === 1 ? 'It has been waiting' : 'The oldest has been waiting'} for ${age}.`,
    /** Reason given by the recommendation (lower case: the headline capitalises it). */
    waitingReason: (n: number, age: string) =>
      `an assistant has been waiting for your answer for ${age}${n > 1 ? ` (the oldest of ${n} requests)` : ''}`,
    stuckTitle: (n: number) => (n === 1 ? 'Something is waiting to be resumed' : `${n} things are waiting to be resumed`),
    stuckPlanReason: (age: string, cause: string) => `this plan has been stopped for ${age}: ${cause}`,
    stuckDefaultCause: 'to resume',
    stuckOrphanReason: (age: string) => `a request has been left unanswered for ${age}: the conversation stopped`,
    stuckSessionReason: (age: string) => `a conversation has been stopped for ${age}`,
    blockedTitle: 'Nothing you can resume right now',
    blockedWhy: (n: number, holder: string | null | undefined) =>
      `${n === 1 ? 'something is waiting to be resumed' : `${n} things are waiting to be resumed`}, but ${
        holder ? `another plan is already in progress: « ${holder} »` : 'no resume is possible for now'
      }`,
    incompleteTitle: 'I cannot tell what to start with',
    incompleteWhy: 'a source did not answer: what needs your answer, what stopped or what is in progress may be missing',
    calmTitle: (n: number) => `Nothing is blocking you: ${n} ${n === 1 ? 'plan is moving on its own' : 'plans are moving on their own'}`,
    calmWhy: 'no assistant is waiting for your answer and nothing is to resume',
    emptyTitle: 'Nothing to do for now',
    emptyWhy: 'no assistant is waiting for your answer, nothing is to resume, nothing is in progress',
  },

  /** A request card of « Waiting for you » (AttentionCard). */
  card: {
    permission: 'Permission',
    question: 'Question',
    permissionBy: (who: string) => `Permission asked by ${who}`,
    questionBy: (who: string) => `Question asked by ${who}`,
    freeConversation: 'Free conversation',
    /** Prefix of the relative time: "for 3h". */
    since: 'for ',
    stopped: 'stopped',
    stateUnknown: 'state unknown',
    live: 'live',
    wantsToLaunch: 'The assistant wants to launch',
    commandAsked: 'Command asked:',
    allow: 'Allow',
    deny: 'Deny',
    sent: 'Answer sent.',
    decided: 'Already decided: the request was handled elsewhere.',
    notSent: 'Answer not sent. You can try again.',
    /** Shown when the conversation stopped before the answer (also the hook's `ORPHAN_NOTICE`). */
    orphanNotice: 'The assistant is gone: its conversation stopped. You can relaunch it with « Resume the conversation ».',
    proposedAnswers: 'Suggested answers',
    otherAnswer: 'Another answer…',
    otherAnswerLabel: 'Another answer',
    yourAnswer: 'Your answer…',
    send: 'Send',
    openConversation: 'Open the conversation',
    provenanceFree: 'Free conversation: attached to no plan',
    attachedToExecution: (id: string | null) => (id ? `attached to execution ${id}` : 'attached to an execution'),
    startedByExecution: (id: string) => `started by execution ${id}`,
    startedByPlan: (name: string | null) => (name ? `started by plan ${name}` : 'started by a plan'),
    attachedToTask: (name: string | null) => (name ? `attached to task ${name}` : 'attached to a task'),
    attachedToPlan: (name: string | null) => (name ? `attached to plan ${name}` : 'attached to a plan'),
  },

  /** A row of « To resume » (ThreadRow). */
  row: {
    resume: 'Resume',
    resuming: 'Resuming…',
    resumeSession: 'Resume the conversation',
    reply: 'Reply…',
    replyTitle: 'Reply',
    send: 'Send',
    resumeField: 'Resume message',
    replyField: 'Answer',
    noThread: 'Free conversation',
    unavailableBusy: 'Unavailable: another plan is already in progress,',
    noPlan: 'No plan to resume.',
    noPreview: 'The resume preview is not available.',
    unblockFirst: 'Unblock them before resuming: a blocked task is skipped.',
    blockedToggle: (n: number) => (n === 1 ? '1 blocked task will be skipped' : `${n} blocked tasks will be skipped`),
    showRequest: 'See the request',
    requestKind: (kind: 'permission' | 'question', tool: string | null) =>
      kind === 'permission' ? `: permission${tool ? ` (${tool})` : ''}` : ': question',
    resumeStarted: 'Resume started.',
    followRun: 'Follow the plan',
    resumeFailed: 'The resume failed.',
    /** Help of an orphan PERMISSION (only valid for a request without decision). */
    helpPermission:
      'The conversation stopped before your answer. Resuming relaunches the assistant, which will ask for the permission again if needed. Nothing was executed.',
    /** Help of an orphan QUESTION. */
    helpQuestion: 'The conversation stopped before your answer. Choose an option: it will be sent as a message on resume.',
    helpLive: 'The assistant is waiting for your answer: it will be sent as a message.',
    livePermissionElsewhere: 'This permission is given in « Waiting for you ».',
    /** What the sheet opens with when no option was chosen. */
    defaultMessage: 'Continue.',
    /** Message sent on resume once the user picked an option of an orphan question (spike 0.1). */
    questionAnswer: (question: string, option: string) =>
      `My answer to your earlier question (« ${question} »): ${option}. Do not ask it again, continue.`,
    since: (age: string) => `for ${age}`,
    rerun: (n: number) => (n > 0 ? `Resume reruns ${plural(n, 'task', 'tasks')}` : 'Resume reruns no task'),
    kept: (n: number) => (n > 0 ? `; ${n} already done` : ''),
    conversationStoppedSince: 'conversation stopped ',
    conversationStopped: 'conversation stopped',
    optionsLabel: 'Options of the question',
    sessionSince: (dead: boolean, duration: string) => `${dead ? 'stopped' : 'in progress'} for ${duration}`,
    /** Provenance of a link, from the fields the backend sent (via + ids only). */
    attachedToExecution: (id: string | null) => (id ? `attached to execution ${id}` : 'attached to an execution'),
    createdByExecution: (id: string | null) => (id ? `created by execution ${id}` : 'created by an execution'),
    attachedToTask: (id: string | null) => (id ? `attached to task ${id}` : 'attached to a task'),
    attachedToPlan: (name: string | null) => (name ? `attached to plan ${name}` : 'attached to a plan'),
  },

  /** A row of « In progress » (PlanRunRow) and the state bar of a plan (PlanStateBar). */
  plan: {
    progress: 'Progress',
    openGraph: 'Open the plan graph',
    noTasks: 'No tasks',
    doneOf: (done: number, total: number) => `${done} of ${total} done`,
    running: 'In progress',
    stopped: 'Stopped',
    waitingTasks: (n: number) => `${plural(n, 'task is waiting', 'tasks are waiting')} for your answer`,
    workers: (n: number) => plural(n, 'assistant is working on it', 'assistants are working on it'),
    tasksRunning: (n: number) => plural(n, 'task in progress', 'tasks in progress'),
    nobody: 'Nobody for now',
    otherThreads: (n: number) => (n === 1 ? '+ 1 other execution of this plan' : `+ ${n} other executions of this plan`),
    otherThreadsLabel: 'Other executions of this plan',
    discussions: { show: 'Conversations', hide: 'Hide the conversations' },
  },

  /** The waves of a plan drawn as marks (MiniThreadGraph). */
  graph: {
    empty: 'empty',
    none: 'No plan graph',
    noWave: 'Plan graph: no wave',
    label: (total: number, body: string) => `Plan graph, ${plural(total, 'wave', 'waves')}: ${body}`,
    wave: (i: number, total: number, body: string) => `wave ${i} of ${total}: ${body}`,
    legendSummary: 'What do the dots mean?',
    legendBody: 'Each group of dots is a wave of tasks (tasks that move at the same time); a dot is a task.',
  },

  /** « To read » (ThinkingList): proposals, decisions, notes to re-read, alerts. */
  thinking: {
    groups: {
      rfc: NOMENCLATURE.proposals.plural,
      decision: NOMENCLATURE.decisions.plural,
      note_review: 'Notes to re-read',
      alert: 'Alerts',
    } satisfies Record<ThinkingKind, string>,
    empty: 'Nothing to read',
    accept: 'Accept',
    reject: 'Reject',
    confirm: 'Confirm',
    invalidate: 'Invalidate',
    acknowledge: 'Acknowledge',
    done: {
      accept: 'Accepted',
      reject: 'Rejected',
      confirm: 'Note confirmed',
      invalidate: 'Note invalidated',
      acknowledge: 'Alert acknowledged',
    },
    notSaved: (detail: string | null) => `Not saved${detail ? `: ${detail}` : ''}`,
    rejectTitle: `Reject this ${NOMENCLATURE.proposals.singular.toLowerCase()}?`,
    rejectDescription: (title: string) => `« ${title} » will be rejected. This is hard to undo.`,
    cancel: 'Cancel',
  },

  /** The message sheet (ContinueSheet). */
  sheet: {
    sendFailed: 'Sending failed.',
    field: 'Message',
    cancel: 'Cancel',
  },

  /** « Assistants » (live/LiveAgents). */
  live: {
    title: 'Assistants',
    region: 'Assistants in progress',
    empty: 'No assistant is working right now',
    idle: (n: number) => `${n} idle`,
    emptyHint: 'When a conversation starts (chat, plan, delegated task), it shows up here.',
    loadError: 'The list of assistants could not be loaded.',
    stale: 'Refresh failed: the list shown may be out of date.',
    retry: 'Try again',
    open: 'Open',
    untitled: 'Untitled conversation',
    states: {
      waiting_input: 'Waiting for your answer',
      streaming: 'Working',
      idle: 'Idle',
    } satisfies Record<LiveAgentState, string>,
    origins: {
      user: 'Chat',
      runner: 'Plan',
      pipeline: 'Pipeline',
      gate: 'Gate',
      delegate: 'Delegated task',
      protocol_runner: 'Protocol',
    } as Record<string, string>,
    waiting: (n: number) => `${n} waiting for your answer`,
    working: (n: number) => `${n} working`,
  },

  /** « My tasks » (work/WorkDashboard). */
  work: {
    title: 'My tasks',
    day: 'My day',
    showAll: (n: number) => `Show all ${n}`,
    showLess: 'Show less',
    dayEmpty: 'Nothing planned for today',
    dayEmptyHint: 'Add tasks from « Up next » or « In progress »: they line up here, in the order you want to do them.',
    inProgress: 'In progress',
    inProgressEmpty: 'No task in progress.',
    next: 'Up next',
    nextEmpty: 'No active plan has a task ready.',
    chains: 'Plans to launch',
    blocked: 'Blocked',
    addToDay: 'Add to my day',
    /** Short label of the visible button; its accessible name stays `addToDay`. */
    add: 'Add',
    removeFromDay: 'Remove from my day',
    moveUp: 'Move up',
    moveDown: 'Move down',
    start: 'Start',
    complete: 'Complete',
    completeAria: (t: string) => `Mark « ${t} » as completed`,
    launch: 'Launch',
    relaunch: 'Relaunch',
    launching: 'Launching…',
    launched: 'Plan launched',
    started: 'Task started',
    completed: 'Task completed',
    actionFailed: 'The action did not go through.',
    neverRun: 'Never launched',
    untitled: 'Untitled task',
    loadError: 'The dashboard could not be loaded.',
    loadFailed: 'Could not load',
    retry: 'Try again',
    stale: 'Refresh failed: what is shown may be out of date.',
    refreshing: 'Refreshing…',
    loading: 'Loading the dashboard',
    project: NOMENCLATURE.projects.singular,
    tasksDone: 'Tasks completed',
    progressOf: (title: string) => `Progress of ${title}`,
    taskStatus: {
      pending: 'To do',
      in_progress: 'In progress',
      blocked: 'Blocked',
      completed: 'Completed',
      failed: 'Failed',
    } as Record<string, string>,
    runLabel: {
      running: 'Running',
      completed: 'Completed',
      failed: 'Failed',
      cancelled: 'Cancelled',
      budget_exceeded: 'Budget exceeded',
    } as Record<string, string>,
  },
} as const

export type TodayText = typeof TEXT
