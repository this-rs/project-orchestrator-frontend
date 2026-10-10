import type { Translation } from '../../catalog.ts'

export default {
  layer: {
    code: { label: 'Código', description: 'Archivos, funciones, structs, traits' },
    pm: { label: 'Proyecto', description: 'Planes, tareas, objetivos' },
    knowledge: { label: 'Conocimiento', description: 'Notas, decisiones, restricciones' },
    fabric: { label: 'Tejido', description: 'IMPORTS, CALLS, CO_CHANGED' },
    neural: { label: 'Neuronal', description: 'Sinapsis, energía, activación' },
    skills: { label: 'Habilidades', description: 'Agrupaciones de conocimiento emergentes' },
    behavioral: { label: 'Conductual', description: 'Protocolos, estados, transiciones (FSM)' },
    chat: { label: 'Chat', description: 'Sesiones de chat y entidades comentadas' },
  },
  preset: {
    code_only: { label: 'Código', description: 'Arquitectura de código pura' },
    knowledge_overlay: { label: 'Conocimiento', description: 'Notas y decisiones sobre el código' },
    neural_view: { label: 'Neuronal', description: 'Red neuronal, habilidades y protocolos' },
    pm_view: { label: 'Proyecto', description: 'Planes, tareas, objetivos' },
    impact_mode: { label: 'Impacto', description: 'Análisis de impacto' },
    behavioral_view: { label: 'Conductual', description: 'Protocolos, habilidades, notas e interconexiones' },
    full_stack: { label: 'Completo', description: 'Todas las capas' },
  },
  group: {
    core: 'Núcleo',
    code: 'Código',
    knowledge: 'Conocimiento',
    git: 'Git',
    sessions: 'Sesiones',
    features: 'Funcionalidades',
    behavioral: 'Conductual',
  },
  scale: { workspace: 'proyectos', project: 'planes + objetivos', plan: 'tareas', task: 'pasos' },
} satisfies Translation<'intelConfig'>
