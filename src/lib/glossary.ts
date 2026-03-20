/**
 * Glossary of technical terms used in the Project Orchestrator.
 * Each entry provides a human-readable label and a plain-language description.
 */

export interface GlossaryEntry {
  /** Display label */
  label: string
  /** Plain-language explanation */
  description: string
}

export const glossary: Record<string, GlossaryEntry> = {
  energy: {
    label: 'Energy',
    description:
      'Recent activity level of an element. The higher the energy, the more actively the element is being worked on.',
  },
  cohesion: {
    label: 'Cohesion',
    description:
      'Measure of the internal strength of a module or component. High cohesion means elements are tightly related to each other.',
  },
  synapse: {
    label: 'Synapse',
    description:
      'Connection between two project elements (notes, tasks, files). Represents a dependency or contextual relationship.',
  },
  scar: {
    label: 'Scar',
    description:
      'Trace left by a past issue. Helps avoid repeating the same mistakes by flagging fragile areas.',
  },
  moat: {
    label: 'Moat',
    description:
      'Protective barrier around a critical component. Indicates that caution is needed when making changes.',
  },
  spreading_activation: {
    label: 'Spreading Activation',
    description:
      'Mechanism that propagates the importance of an element to its neighbors in the graph, like a wave through a network.',
  },
  fabric: {
    label: 'Fabric',
    description:
      "The project's knowledge network — the set of connections between notes, decisions, and code.",
  },
  trajectory: {
    label: 'Trajectory',
    description:
      'History of the path taken by an agent or task through the project stages.',
  },
  protocol: {
    label: 'Protocol',
    description:
      'Finite state machine describing a workflow. Defines valid transitions between statuses.',
  },
  persona: {
    label: 'Persona',
    description:
      'Specialized profile assigned to an agent to guide its behavior and skills.',
  },
  episode: {
    label: 'Episode',
    description:
      'Recorded work session of an agent, including actions taken and results obtained.',
  },
  neural_routing: {
    label: 'Neural Routing',
    description:
      'Intelligent task distribution system for agents, based on their skills and workload.',
  },
  milestone: {
    label: 'Milestone',
    description:
      'Important checkpoint in the project. Groups tasks and marks a key stage of progress.',
  },
  feature_graph: {
    label: 'Feature Graph',
    description:
      'Visualization of dependencies between project features, showing which features depend on each other.',
  },
  lifecycle_hook: {
    label: 'Lifecycle Hook',
    description:
      "Automatic action triggered on a status change (e.g., notification when a task moves to 'completed').",
  },
  constraint: {
    label: 'Constraint',
    description:
      'Rule or limitation that applies to a task or plan. Must be respected for the work to be considered valid.',
  },
  decision: {
    label: 'Decision',
    description:
      'Architectural or technical choice recorded with its context and rationale, for future reference.',
  },
  component: {
    label: 'Component',
    description:
      'Functional module of the project (backend, frontend, API, etc.) used to organize code and responsibilities.',
  },
  workspace: {
    label: 'Workspace',
    description:
      'Isolated container grouping projects, tasks, and resources. Allows separating different work contexts.',
  },
  skill: {
    label: 'Skill',
    description:
      "Registered capability of an agent, describing what it can do and at what level of mastery.",
  },
  release: {
    label: 'Release',
    description:
      'Published version of the project, grouping a set of changes ready for production.',
  },
  success_rate: {
    label: 'Success Rate',
    description:
      'Percentage of tasks completed successfully by this persona. Reflects its reliability on assigned missions.',
  },
  activation_count: {
    label: 'Activations',
    description:
      'Number of times an element has been activated (used by an agent). The higher the count, the more the element is solicited.',
  },
  analysis_profile: {
    label: 'Analysis Profile',
    description:
      'Configuration defining how to analyze a project: which metrics to compute, which thresholds to apply.',
  },
  co_change: {
    label: 'Co-change',
    description:
      'Files that often change together. Strong co-change suggests coupling (intentional or accidental).',
  },
  coupling: {
    label: 'Coupling',
    description:
      'Degree of dependency between two modules. Low coupling is preferable for maintainability.',
  },
  churn: {
    label: 'Churn',
    description:
      'How frequently a file is modified. High churn may indicate an unstable area or active development.',
  },
  hotspot: {
    label: 'Hotspot',
    description:
      'Frequently modified and complex file. Hotspots are areas to monitor as they concentrate bug risk.',
  },
  orphan: {
    label: 'Orphan File',
    description:
      'File that is neither imported nor exported by other files. May indicate dead code or a poorly integrated file.',
  },
  dead_note: {
    label: 'Dead Note',
    description:
      'Note with no residual energy — it has not been accessed or modified in a long time and may be obsolete.',
  },
  stale_note: {
    label: 'Stale Note',
    description:
      'Note whose content has not been updated for a while and may no longer reflect the current project state.',
  },
  god_function: {
    label: 'God Function',
    description:
      'Excessively long or complex function that does too many things. Should be split into smaller functions.',
  },
  clustering_coefficient: {
    label: 'Clustering Coefficient',
    description:
      "Measures the density of connections between a node's neighbors. A high coefficient indicates a strongly interconnected group.",
  },
  knowledge_coverage: {
    label: 'Knowledge Coverage',
    description:
      'Ratio of notes/decisions to code files. Indicates whether the code is well documented.',
  },
  note_freshness: {
    label: 'Note Freshness',
    description:
      'Proportion of notes that are still up to date. A low rate means many notes need review.',
  },
  synapse_quality: {
    label: 'Synapse Quality',
    description:
      'Proportion of strong connections in the network. Weak synapses are unreliable links between elements.',
  },
  skills_maturity: {
    label: 'Skills Maturity',
    description:
      "Ratio of active skills to total. Indicates the team's overall mastery level on the project.",
  },
  code_safety: {
    label: 'Code Safety',
    description:
      'Score based on risk assessment. Takes into account critical files, high-risk files, and vulnerabilities.',
  },
  health_score: {
    label: 'Health Score',
    description:
      'Overall score combining knowledge coverage, note freshness, neural energy, synapse quality, and skills maturity.',
  },
  circular_dependency: {
    label: 'Circular Dependency',
    description:
      'Situation where two modules depend on each other, creating a loop. Makes the code harder to maintain and test.',
  },
} as const

/** Get a glossary entry by key, or undefined if not found */
export function getGlossaryEntry(term: string): GlossaryEntry | undefined {
  return glossary[term.toLowerCase().replace(/[\s-]/g, '_')]
}

/** All glossary term keys */
export type GlossaryTerm = keyof typeof glossary
