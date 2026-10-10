import type { Translation } from '../../catalog.ts'

export default {
  status: {
    running: 'En cours',
    queued: 'En file d\'attente',
    done: 'Terminé',
    failed: 'Échec',
    cancelled: 'Annulé',
    ended: 'Arrêté',
  },
  lifecycle: {
    started: 'Démarré',
    progress: 'Progression',
    updated: 'Mis à jour',
    finished: 'Terminé',
  },
  param: {
    agent: 'Agent',
    workflow: 'Workflow',
    task: 'Tâche',
    tool: 'Outil',
    model: 'Modèle',
    exitCode: 'Code de sortie',
    taskId: 'ID de la tâche',
    outputFile: 'Fichier de sortie',
  },
  title: {
    workflow: 'Workflow',
    shell: 'Commande en arrière-plan',
    monitor: 'Moniteur',
    agent: 'Sous-agent',
  },
} satisfies Translation<'activity'>
