import type { Translation } from '../../catalog.ts'

export default {
  summary: {
    waves: 'Ondas:',
    maxParallel: 'Paralelismo máx.:',
    criticalPath: 'Caminho crítico:',
    tasks: 'Tarefas:',
    conflicts: '{count} conflitos',
    viewRunner: 'Ver runner',
    resume: 'Retomar plano',
    launch: 'Iniciar plano',
  },
  card: {
    hideSteps: 'Ocultar as etapas de {title}',
    showSteps: 'Mostrar as etapas de {title}',
    working: 'Trabalhando…',
    conflictOn: 'Conflito em: {files}',
    fileConflict: 'Conflito de arquivo',
    stepsDone: '{done} de {total} etapas concluídas',
    sharedFile: '{file} — compartilhado com outra tarefa desta onda',
    loadingSteps: 'Carregando etapas…',
    verify: 'Verificar: {text}',
    noSteps: 'Nenhuma etapa',
    openTask: 'Abrir tarefa',
  },
  column: {
    wave: 'Onda {number}',
    activeWave: 'Onda ativa',
    split: 'dividida',
    progress: 'Onda {number}: {done} de {total} tarefas concluídas',
  },
  none: 'Nenhuma onda calculada',
} satisfies Translation<'waves'>
