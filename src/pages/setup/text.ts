/**
 * Words of the first minute after the download: the setup assistant and its chrome.
 *
 * The person who reads this has just clicked « Download » on the site, so the
 * sentences continue the site's own (website/src/i18n/messages/en/{downloads,
 * features,hero}.ts, sections/trust/content.ts): prerequisites said honestly
 * (« It needs Docker Desktop », « It does not include the AI »), short sentences,
 * no promise the app does not keep.
 *
 * i18n after #252: English source strings, grouped here until the i18n layer
 * lands (then they move under `setup.*`). Banner titles asserted by the tests
 * (« Docker Desktop is running », « Docker Desktop is required »…) stay in their
 * page: they are the contract of #246 / #248 / #237 / #230, not copy.
 */

export type SetupStepKey = 'infra' | 'auth' | 'chat' | 'launch'

export interface SetupStepText {
  key: SetupStepKey
  /** Short name in the progress line (one or two words). */
  label: string
  /** The display title of the step (one per screen). */
  title: string
  /** The lead under the title: what this step needs, said the way the site says it. */
  lead: string
}

export const SETUP_STEPS: readonly SetupStepText[] = [
  {
    key: 'infra',
    label: 'Infrastructure',
    title: 'Infrastructure',
    // website: features.limits « It needs Docker Desktop » · downloads.needs.docker · pricing.columns.pc
    lead:
      'Docker Desktop is required: the database and the search engine run in it, and the app starts them for you. If you already run those servers, point the app at them instead.',
  },
  {
    key: 'auth',
    label: 'Authentication',
    title: 'Authentication',
    // website: downloads.subhead « There is no Project Orchestrator account to create » · FAQ « Do I need an account? »
    lead:
      'There is no Project Orchestrator account to create. On a computer only you use, keep sign-in off. On a shared network, add a password or your organisation’s sign-in.',
  },
  {
    key: 'chat',
    label: 'Chat AI',
    title: 'Chat AI',
    // website: hero.facts « Chat runs on Claude Code, or a model you connect » · features.limits « It does not include the AI » · downloads.needs.claude
    lead:
      'Chat runs on Claude Code with your own account, or on a model you connect later. The AI itself is not included. The app can install Claude Code for you and downloads the search model once.',
  },
  {
    key: 'launch',
    label: 'Launch',
    title: 'Launch',
    // website: install guide « Wait for the first start » (the app downloads the images it runs on; later starts are quicker)
    lead:
      'Check the summary, save the configuration, then restart. The first launch takes a few minutes: the app downloads the services it runs on. Later starts are quicker.',
  },
]

export const SETUP_TEXT = {
  productName: 'Project Orchestrator',
  /** Kicker under the product name, first setup. */
  kickerSetup: 'Initial setup',
  /** Kicker under the product name, reconfigure mode (opened from the tray). */
  kickerReconfigure: 'Configuration',
  close: 'Close',
  closeAria: 'Back to the app',
  progressLabel: 'Setup progress',
  /** « Step 2 of 4 » — the words next to the bar, never the bar alone. */
  stepOf: (n: number, total: number) => `Step ${n} of ${total}`,
  /** Visually-hidden suffixes of the step list, so the state is never colour alone. */
  stepDone: 'done',
  stepCurrent: 'current step',
  previous: 'Previous',
  next: 'Next',
  finish: 'Finish',
  /** Shown (always visible, never on hover) while Next is disabled. */
  blocked: 'Finish the checks above to continue.',
  /** Reconfigure mode: the steps are free to open in any order. */
  freeNavigationHint: 'Open any step to change it.',
} as const
