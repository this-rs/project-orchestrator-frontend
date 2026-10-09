import type { Translation } from '../../catalog.ts'

export default {
  status: {
    running: 'Em andamento',
    queued: 'Na fila',
    done: 'Concluído',
    failed: 'Falhou',
    cancelled: 'Cancelado',
    ended: 'Encerrado',
  },
  lifecycle: {
    started: 'Iniciado',
    progress: 'Progresso',
    updated: 'Atualizado',
    finished: 'Finalizado',
  },
  param: {
    agent: 'Agente',
    workflow: 'Fluxo de trabalho',
    task: 'Tarefa',
    tool: 'Ferramenta',
    model: 'Modelo',
    exitCode: 'Código de saída',
    taskId: 'ID da tarefa',
    outputFile: 'Arquivo de saída',
  },
  title: {
    workflow: 'Fluxo de trabalho',
    shell: 'Comando em segundo plano',
    monitor: 'Monitor',
    agent: 'Subassistente',
  },
} satisfies Translation<'activity'>
