/**
 * Catalog: types derived from English (the only source language) and the list of domains.
 * A domain is one file per language (messages/<lang>/<ns>.ts); a page or feature owns its own.
 *
 * Side-effect free: also imported by Node (scripts/check-i18n.mjs), hence no `@/` alias.
 */
import type common from './messages/en/common.ts'
import type architecture from './messages/en/architecture.ts'
import type code from './messages/en/code.ts'
import type featureGraphs from './messages/en/featureGraphs.ts'
import type graph from './messages/en/graph.ts'
import type projects from './messages/en/projects.ts'
import type commits from './messages/en/commits.ts'
import type deployments from './messages/en/deployments.ts'
import type kanban from './messages/en/kanban.ts'
import type milestones from './messages/en/milestones.ts'
import type pipeline from './messages/en/pipeline.ts'
import type planDetail from './messages/en/planDetail.ts'
import type plans from './messages/en/plans.ts'
import type taskDetail from './messages/en/taskDetail.ts'
import type tasks from './messages/en/tasks.ts'
import type waves from './messages/en/waves.ts'
import type intelPage from './messages/en/intelPage.ts'
import type intelDashboard from './messages/en/intelDashboard.ts'
import type intelGraph from './messages/en/intelGraph.ts'
import type intelLearning from './messages/en/intelLearning.ts'
import type intelTimeline from './messages/en/intelTimeline.ts'
import type nav from './messages/en/nav.ts'
import type routing from './messages/en/routing.ts'
import type session from './messages/en/session.ts'
import type ui from './messages/en/ui.ts'
import type forms from './messages/en/forms.ts'
import type composer from './messages/en/composer.ts'
import type shell from './messages/en/shell.ts'
import type nomenclature from './messages/en/nomenclature.ts'
import type glossary from './messages/en/glossary.ts'
import type toolPolicy from './messages/en/toolPolicy.ts'
import type activity from './messages/en/activity.ts'
import type fgModel from './messages/en/fgModel.ts'
import type setupOidc from './messages/en/setupOidc.ts'
import type app from './messages/en/app.ts'
import type providers from './messages/en/providers.ts'
import type providerErrors from './messages/en/providerErrors.ts'
import type intelConfig from './messages/en/intelConfig.ts'

interface EnglishMessages {
  common: typeof common
  architecture: typeof architecture
  code: typeof code
  featureGraphs: typeof featureGraphs
  graph: typeof graph
  projects: typeof projects
  commits: typeof commits
  deployments: typeof deployments
  kanban: typeof kanban
  milestones: typeof milestones
  pipeline: typeof pipeline
  planDetail: typeof planDetail
  plans: typeof plans
  taskDetail: typeof taskDetail
  tasks: typeof tasks
  waves: typeof waves
  intelPage: typeof intelPage
  intelDashboard: typeof intelDashboard
  intelGraph: typeof intelGraph
  intelLearning: typeof intelLearning
  intelTimeline: typeof intelTimeline
  nav: typeof nav
  routing: typeof routing
  session: typeof session
  ui: typeof ui
  forms: typeof forms
  composer: typeof composer
  shell: typeof shell
  nomenclature: typeof nomenclature
  glossary: typeof glossary
  toolPolicy: typeof toolPolicy
  activity: typeof activity
  fgModel: typeof fgModel
  setupOidc: typeof setupOidc
  app: typeof app
  providers: typeof providers
  providerErrors: typeof providerErrors
  intelConfig: typeof intelConfig
}

export type Ns = keyof EnglishMessages
export const NAMESPACES = [
  'common', 'nav', 'routing', 'session', 'architecture', 'code', 'featureGraphs', 'graph', 'projects',
  'ui', 'forms', 'composer', 'shell', 'nomenclature', 'glossary', 'toolPolicy', 'activity', 'fgModel', 'setupOidc', 'app', 'providers', 'providerErrors', 'intelConfig',
  'commits', 'deployments', 'kanban', 'milestones', 'pipeline', 'planDetail', 'plans', 'taskDetail', 'tasks', 'waves',
  'intelPage', 'intelDashboard', 'intelGraph', 'intelLearning', 'intelTimeline',
] as const satisfies readonly Ns[]

/** Every other language is a (possibly partial) overlay of the same shape. */
export type Translation<N extends Ns> = DeepPartial<EnglishMessages[N]>
export type DeepPartial<T> = T extends string ? string : { [K in keyof T]?: DeepPartial<T[K]> }

type Join<P extends string, K extends string> = P extends '' ? K : `${P}.${K}`
type Leaves<T, P extends string = ''> = T extends string
  ? P
  : { [K in keyof T & string]: Leaves<T[K], Join<P, K>> }[keyof T & string]

/** `ns.path.to.string`, checked against English at compile time. */
export type MessageKey = { [N in Ns]: Leaves<EnglishMessages[N], N> }[Ns]
export type Vars = Readonly<Record<string, string | number>>
export type Messages = EnglishMessages
