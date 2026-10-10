import type { Translation } from '../../catalog.ts'

export default {
  layer: {
    code: { label: 'Código', description: 'Arquivos, funções, structs, traits' },
    pm: { label: 'Projeto', description: 'Planos, tarefas, objetivos' },
    knowledge: { label: 'Conhecimento', description: 'Notas, decisões, restrições' },
    fabric: { label: 'Tecido', description: 'IMPORTS, CALLS, CO_CHANGED' },
    neural: { label: 'Neural', description: 'Sinapses, energia, ativação' },
    skills: { label: 'Habilidades', description: 'Agrupamentos de conhecimento emergentes' },
    behavioral: { label: 'Comportamental', description: 'Protocolos, estados, transições (FSM)' },
    chat: { label: 'Chat', description: 'Sessões de chat e entidades discutidas' },
  },
  preset: {
    code_only: { label: 'Código', description: 'Arquitetura de código pura' },
    knowledge_overlay: { label: 'Conhecimento', description: 'Notas e decisões sobre o código' },
    neural_view: { label: 'Neural', description: 'Rede neural, habilidades e protocolos' },
    pm_view: { label: 'Projeto', description: 'Planos, tarefas, objetivos' },
    impact_mode: { label: 'Impacto', description: 'Análise de impacto' },
    behavioral_view: { label: 'Comportamental', description: 'Protocolos, habilidades, notas e interconexões' },
    full_stack: { label: 'Completo', description: 'Todas as camadas' },
  },
  group: {
    core: 'Essencial',
    code: 'Código',
    knowledge: 'Conhecimento',
    git: 'Git',
    sessions: 'Sessões',
    features: 'Funcionalidades',
    behavioral: 'Comportamental',
  },
  scale: { workspace: 'projetos', project: 'planos + objetivos', plan: 'tarefas', task: 'etapas' },
} satisfies Translation<'intelConfig'>
