import type { Translation } from '../../catalog.ts'

export default {
  layer: {
    code: { label: 'Code', description: 'Fichiers, fonctions, structs, traits' },
    pm: { label: 'Projet', description: 'Plans, tâches, objectifs' },
    knowledge: { label: 'Connaissances', description: 'Notes, décisions, contraintes' },
    fabric: { label: 'Tissu', description: 'IMPORTS, CALLS, CO_CHANGED' },
    neural: { label: 'Neuronal', description: 'Synapses, énergie, activation' },
    skills: { label: 'Compétences', description: 'Groupes de connaissances émergents' },
    behavioral: { label: 'Comportemental', description: 'Protocoles, états, transitions (FSM)' },
    chat: { label: 'Chat', description: 'Sessions de chat et entités discutées' },
  },
  preset: {
    code_only: { label: 'Code', description: 'Architecture du code seule' },
    knowledge_overlay: { label: 'Connaissances', description: 'Notes et décisions sur le code' },
    neural_view: { label: 'Neuronal', description: 'Réseau neuronal, compétences et protocoles' },
    pm_view: { label: 'Projet', description: 'Plans, tâches, objectifs' },
    impact_mode: { label: 'Impact', description: 'Analyse d\'impact' },
    behavioral_view: { label: 'Comportemental', description: 'Protocoles, compétences, notes et interconnexions' },
    full_stack: { label: 'Complet', description: 'Toutes les couches' },
  },
  group: {
    core: 'Cœur',
    code: 'Code',
    knowledge: 'Connaissances',
    git: 'Git',
    sessions: 'Sessions',
    features: 'Fonctionnalités',
    behavioral: 'Comportemental',
  },
  scale: { workspace: 'projets', project: 'plans + objectifs', plan: 'tâches', task: 'étapes' },
} satisfies Translation<'intelConfig'>
