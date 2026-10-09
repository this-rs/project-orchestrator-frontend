import type { Translation } from '../../catalog.ts'

export default {
  layer: {
    code: { label: 'Code', description: 'Dateien, Funktionen, Structs, Traits' },
    pm: { label: 'Projekt', description: 'Pläne, Aufgaben, Ziele' },
    knowledge: { label: 'Wissen', description: 'Notizen, Entscheidungen, Constraints' },
    fabric: { label: 'Wissensgewebe', description: 'IMPORTS, CALLS, CO_CHANGED' },
    neural: { label: 'Neuronal', description: 'Synapsen, Energie, Aktivierung' },
    skills: { label: 'Fähigkeiten', description: 'Entstehende Wissenscluster' },
    behavioral: { label: 'Verhalten', description: 'Protokolle, Zustände, Übergänge (FSM)' },
    chat: { label: 'Chat', description: 'Chat-Sitzungen und besprochene Elemente' },
  },
  preset: {
    code_only: { label: 'Code', description: 'Reine Code-Architektur' },
    knowledge_overlay: { label: 'Wissen', description: 'Notizen und Entscheidungen zum Code' },
    neural_view: { label: 'Neuronal', description: 'Neuronales Netz, Fähigkeiten und Protokolle' },
    pm_view: { label: 'Projekt', description: 'Pläne, Aufgaben, Ziele' },
    impact_mode: { label: 'Auswirkung', description: 'Auswirkungsanalyse' },
    behavioral_view: { label: 'Verhalten', description: 'Protokolle, Fähigkeiten, Notizen und Verknüpfungen' },
    full_stack: { label: 'Vollständig', description: 'Alle Ebenen' },
  },
  group: {
    core: 'Kern',
    code: 'Code',
    knowledge: 'Wissen',
    git: 'Git',
    sessions: 'Sitzungen',
    features: 'Funktionen',
    behavioral: 'Verhalten',
  },
  scale: { workspace: 'Projekte', project: 'Pläne + Ziele', plan: 'Aufgaben', task: 'Schritte' },
} satisfies Translation<'intelConfig'>
