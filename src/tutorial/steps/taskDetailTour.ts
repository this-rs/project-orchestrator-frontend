import type { Tour } from 'nextstepjs'

/**
 * Task detail micro-tour — 4 steps covering a single task's detail page.
 * Requires navigation to /tasks/:id.
 */
export const taskDetailTour: Tour = {
  tour: 'task-detail',
  steps: [
    {
      icon: '📝',
      title: 'Les steps de la tâche',
      content:
        "Chaque tâche est décomposée en steps atomiques. Cochez les steps au fur et à mesure de votre progression. Le critère de vérification vous indique comment valider chaque étape.",
      selector: '[data-tour="task-detail-steps"]',
      side: 'bottom',
      showControls: true,
      showSkip: true,
      pointerPadding: 8,
      pointerRadius: 12,
    },
    {
      icon: '✅',
      title: "Critères d'acceptation",
      content:
        "Les critères d'acceptation définissent les conditions pour considérer la tâche comme terminée. Vérifiez-les tous avant de passer le statut à Completed.",
      selector: '[data-tour="task-detail-acceptance"]',
      side: 'bottom',
      showControls: true,
      showSkip: true,
      pointerPadding: 8,
      pointerRadius: 12,
    },
    {
      icon: '🔗',
      title: 'Dépendances',
      content:
        "Les dépendances montrent quelles tâches doivent être complétées avant celle-ci, et quelles tâches sont bloquées par celle-ci. Gérez l'ordre d'exécution ici.",
      selector: '[data-tour="task-detail-dependencies"]',
      side: 'bottom',
      showControls: true,
      showSkip: true,
      pointerPadding: 8,
      pointerRadius: 12,
    },
    {
      icon: '🏛️',
      title: 'Décisions architecturales',
      content:
        "Documentez les choix techniques importants : quelle approche choisie, pourquoi, quelles alternatives considérées. Ces décisions sont consultées par l'IA pour maintenir la cohérence du projet.",
      selector: '[data-tour="task-detail-decisions"]',
      side: 'bottom',
      showControls: true,
      showSkip: false,
      pointerPadding: 8,
      pointerRadius: 12,
    },
  ],
}
