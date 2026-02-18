import type { Tour } from 'nextstepjs'

/**
 * Kanban micro-tour — 2 steps covering the Kanban board features.
 * Requires a Kanban view to be active (plans or tasks).
 */
export const kanbanTour: Tour = {
  tour: 'kanban',
  steps: [
    {
      icon: '🔍',
      title: 'Filtres et recherche',
      content:
        'Filtrez les cartes par statut, priorité ou texte libre. Les filtres se combinent pour affiner votre vue. Le compteur indique le nombre de résultats.',
      selector: '[data-tour="kanban-filter-bar"]',
      side: 'bottom',
      showControls: true,
      showSkip: true,
      pointerPadding: 8,
      pointerRadius: 12,
    },
    {
      icon: '📊',
      title: 'Colonnes Kanban',
      content:
        "Chaque colonne représente un statut. Glissez-déposez les cartes d'une colonne à l'autre pour changer leur statut instantanément. Le compteur en haut de chaque colonne indique le nombre d'éléments.",
      selector: '[data-tour="kanban-columns"]',
      side: 'bottom',
      showControls: true,
      showSkip: false,
      pointerPadding: 8,
      pointerRadius: 12,
    },
  ],
}
