import type { Translation } from '../../catalog.ts'

export default {
  status: {
    running: 'En curso',
    queued: 'En cola',
    done: 'Terminado',
    failed: 'Falló',
    cancelled: 'Cancelado',
    ended: 'Finalizado',
  },
  lifecycle: {
    started: 'Iniciado',
    progress: 'Progreso',
    updated: 'Actualizado',
    finished: 'Finalizado',
  },
  param: {
    agent: 'Agente',
    workflow: 'Flujo de trabajo',
    task: 'Tarea',
    tool: 'Herramienta',
    model: 'Modelo',
    exitCode: 'Código de salida',
    taskId: 'ID de la tarea',
    outputFile: 'Archivo de salida',
  },
  title: {
    workflow: 'Flujo de trabajo',
    shell: 'Comando en segundo plano',
    monitor: 'Monitor',
    agent: 'Subagente',
  },
} satisfies Translation<'activity'>
