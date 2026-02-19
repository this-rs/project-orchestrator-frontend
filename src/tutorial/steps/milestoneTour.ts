import type { Tour } from 'nextstepjs'

/**
 * Milestones micro-tour — 4 steps covering the milestones pages.
 * Requires navigation to /milestones.
 */
export const milestoneTour: Tour = {
  tour: 'milestones',
  steps: [
    {
      icon: '🏁',
      title: 'Vos milestones',
      content:
        "Les milestones marquent les jalons importants de vos projets. Chaque carte affiche le titre, le statut, le workspace d'origine et une barre de progression calculée sur les tâches liées (complétées / total).",
      selector: '[data-tour="milestones-list-view"]',
      side: 'bottom',
      showControls: true,
      showSkip: true,
      pointerPadding: 8,
      pointerRadius: 12,
    },
    {
      icon: '🔍',
      title: 'Filtrer les milestones',
      content:
        'Filtrez par workspace pour voir les milestones d\'un seul contexte, ou par statut (Planned, Open, In Progress, Completed, Closed). Les filtres se combinent.',
      selector: '[data-tour="milestone-filters"]',
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
        'Comme pour les plans, basculez entre la vue liste et la vue Kanban. En Kanban, les colonnes représentent les statuts et vous pouvez glisser-déposer les milestones entre elles.',
      selector: '[data-tour="milestone-view-toggle"]',
      side: 'bottom',
      showControls: true,
      showSkip: false,
      pointerPadding: 4,
      pointerRadius: 8,
    },
  ],
}
