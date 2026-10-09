import type { Translation } from '../../catalog.ts'

export default {
  summary: {
    waves: 'Vagues :',
    maxParallel: 'Parallélisme max :',
    criticalPath: 'Chemin critique :',
    tasks: 'Tâches :',
    conflicts: '{count} conflits',
    viewRunner: 'Voir le runner',
    resume: 'Reprendre le plan',
    launch: 'Lancer le plan',
  },
  card: {
    hideSteps: 'Masquer les étapes de {title}',
    showSteps: 'Afficher les étapes de {title}',
    working: 'En cours de traitement…',
    conflictOn: 'Conflit sur : {files}',
    fileConflict: 'Conflit de fichier',
    stepsDone: '{done} étapes sur {total} terminées',
    sharedFile: '{file} — partagé avec une autre tâche de cette vague',
    loadingSteps: 'Chargement des étapes…',
    verify: 'Vérification : {text}',
    noSteps: 'Aucune étape',
    openTask: 'Ouvrir la tâche',
  },
  column: {
    wave: 'Vague {number}',
    activeWave: 'Vague active',
    split: 'scindée',
    progress: 'Vague {number} : {done} tâches sur {total} terminées',
  },
  none: 'Aucune vague calculée',
} satisfies Translation<'waves'>
