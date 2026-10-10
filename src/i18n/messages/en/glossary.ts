export default {
  energy: {
    label: 'Energy',
    description: 'Recent activity level of an element. The higher the energy, the more actively the element is being worked on.',
  },
  cohesion: {
    label: 'Cohesion',
    description: 'Measure of the internal strength of a module or component. High cohesion means its elements are tightly linked to each other.',
  },
  synapse: {
    label: 'Synapse',
    description: 'Connection between two elements of the project (notes, tasks, files). Represents a dependency or context relation.',
  },
  scar: {
    label: 'Scar',
    description: 'Trace left by a past problem. Helps avoid repeating the same mistakes by flagging fragile areas.',
  },
  moat: {
    label: 'Moat',
    description: 'Protective barrier around a critical component. Signals that changes there call for extra care.',
  },
  spreading_activation: {
    label: 'Spreading activation',
    description: 'Mechanism that propagates the importance of an element to its neighbours in the graph, like a wave through a network.',
  },
  fabric: {
    label: 'Fabric',
    description: 'The knowledge network of the project — the set of connections between notes, decisions and code.',
  },
  trajectory: {
    label: 'Trajectory',
    description: 'History of the path an agent or a task took through the stages of the project.',
  },
  protocol: {
    label: 'Protocol',
    description: 'Finite state machine describing a workflow. Defines the valid transitions between statuses.',
  },
  persona: {
    label: 'Persona',
    description: 'Specialised profile assigned to an agent to steer its behaviour and skills.',
  },
  episode: {
    label: 'Episode',
    description: 'Recorded work session of an agent, with the actions taken and the results obtained.',
  },
  neural_routing: {
    label: 'Neural routing',
    description: 'Smart distribution of tasks to agents, based on their skills and workload.',
  },
  milestone: {
    label: 'Milestone',
    description: 'Important checkpoint in the project. Groups tasks and marks a key step of progress.',
  },
  feature_graph: {
    label: 'Feature graph',
    description: 'Visualisation of the dependencies between features of the project, showing which features depend on which.',
  },
  lifecycle_hook: {
    label: 'Lifecycle hook',
    description: 'Automatic action triggered by a status change (e.g. a notification when a task moves to \'completed\').',
  },
  constraint: {
    label: 'Constraint',
    description: 'Rule or limitation that applies to a task or a plan. Must be respected for the work to count as valid.',
  },
  decision: {
    label: 'Decision',
    description: 'Architectural or technical choice recorded with its context and rationale, for future reference.',
  },
  component: {
    label: 'Component',
    description: 'Functional module of the project (backend, frontend, API…) used to organise code and responsibilities.',
  },
  workspace: {
    label: 'Workspace',
    description: 'Isolated container grouping projects, tasks and resources. Keeps different work contexts apart.',
  },
  skill: {
    label: 'Skill',
    description: 'Recorded capability of an agent, describing what it knows how to do and at which level of mastery.',
  },
  release: {
    label: 'Release',
    description: 'Published version of the project, grouping a set of changes ready for production.',
  },
  success_rate: {
    label: 'Success rate',
    description: 'Percentage of tasks completed successfully by this persona. Reflects its reliability on the missions assigned.',
  },
  activation_count: {
    label: 'Activations',
    description: 'Number of times an element was activated (used by an agent). The higher the number, the more the element is called on.',
  },
  analysis_profile: {
    label: 'Analysis profile',
    description: 'Configuration defining how to analyse a project: which metrics to compute, which thresholds to apply.',
  },
  co_change: {
    label: 'Co-change',
    description: 'Files that often change together. Strong co-change suggests coupling (intended or accidental).',
  },
  coupling: {
    label: 'Coupling',
    description: 'Degree of dependency between two modules. Low coupling is preferable for maintainability.',
  },
  churn: {
    label: 'Churn',
    description: 'How often a file is modified. High churn can indicate an unstable area or one under active development.',
  },
  hotspot: {
    label: 'Hotspot',
    description: 'Frequently modified, complex file. Hotspots are areas to watch because they concentrate the risk of bugs.',
  },
  orphan: {
    label: 'Orphan file',
    description: 'File that is neither imported nor exported by other files. May indicate dead code or a poorly integrated file.',
  },
  dead_note: {
    label: 'Dead note',
    description: 'Note with no residual energy — it has not been read or modified for a long time and is likely obsolete.',
  },
  stale_note: {
    label: 'Stale note',
    description: 'Note whose content has not been updated for a while and may no longer reflect the current state of the project.',
  },
  god_function: {
    label: 'God function',
    description: 'Excessively long or complex function that does too many things. Should be split into smaller functions.',
  },
  clustering_coefficient: {
    label: 'Clustering coefficient',
    description: 'Measures the density of connections between a node\'s neighbours. A high coefficient indicates a tightly interconnected group.',
  },
  knowledge_coverage: {
    label: 'Knowledge coverage',
    description: 'Ratio between the number of notes/decisions and the number of code files. Indicates whether the code is well documented.',
  },
  note_freshness: {
    label: 'Note freshness',
    description: 'Share of notes still up to date. A low rate means many notes need a re-read.',
  },
  synapse_quality: {
    label: 'Synapse quality',
    description: 'Share of solid connections in the network. Weak synapses are unreliable links between elements.',
  },
  skills_maturity: {
    label: 'Skills maturity',
    description: 'Ratio of active skills to the total. Indicates the team\'s overall level of mastery on the project.',
  },
  code_safety: {
    label: 'Code safety',
    description: 'Score based on the risk assessment. Accounts for critical and high-risk files and for vulnerabilities.',
  },
  health_score: {
    label: 'Health score',
    description: 'Overall score combining knowledge coverage, note freshness, neural energy, synapse quality and skills maturity.',
  },
  circular_dependency: {
    label: 'Circular dependency',
    description: 'Situation where two modules depend on each other, creating a loop. Makes the code harder to maintain and test.',
  },
} as const
