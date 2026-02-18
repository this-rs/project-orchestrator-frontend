import type { Tour } from 'nextstepjs'

/**
 * Plan list micro-tour — 4 steps covering the plans overview page.
 * Requires navigation to /plans.
 */
export const planListTour: Tour = {
  tour: 'plan-list',
  steps: [
    {
      icon: '📋',
      title: 'Liste de vos plans',
      content:
        'Tous vos plans de développement sont ici. Chaque carte affiche le titre, le statut, la priorité et la progression des tâches. Cliquez sur un plan pour voir ses détails.',
      selector: '[data-tour="plans-list"]',
      side: 'top',
      showControls: true,
      showSkip: true,
      pointerPadding: 8,
      pointerRadius: 12,
    },
    {
      icon: '🔍',
      title: 'Filtrer par statut',
      content:
        'Filtrez les plans par statut : Draft, Approved, In Progress, Completed ou Cancelled. Utile quand vous avez beaucoup de plans pour retrouver rapidement ceux en cours.',
      selector: '[data-tour="plan-status-filter"]',
      side: 'bottom',
      showControls: true,
      showSkip: true,
      pointerPadding: 4,
      pointerRadius: 8,
    },
    {
      icon: '📊',
      title: 'Vue liste ou Kanban',
      content:
        'Basculez entre la vue liste classique et la vue Kanban. Le Kanban organise vos plans en colonnes par statut avec du drag & drop pour changer le statut rapidement.',
      selector: '[data-tour="plan-view-toggle"]',
      side: 'bottom',
      showControls: true,
      showSkip: true,
      pointerPadding: 4,
      pointerRadius: 8,
    },
    {
      icon: '➕',
      title: 'Créer un plan',
      content:
        "Cliquez ici pour créer un nouveau plan de développement. Donnez-lui un titre, une description et une priorité. Vous pourrez ensuite y ajouter des tâches, des contraintes et des décisions.",
      selector: '[data-tour="plan-create-btn"]',
      side: 'bottom',
      showControls: true,
      showSkip: false,
      pointerPadding: 4,
      pointerRadius: 8,
    },
  ],
}
