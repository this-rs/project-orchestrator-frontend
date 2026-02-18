import type { Tour } from 'nextstepjs'

/**
 * Plan detail micro-tour — 6 steps covering a single plan's detail page.
 * Requires navigation to /plans/:id.
 */
export const planDetailTour: Tour = {
  tour: 'plan-detail',
  steps: [
    {
      icon: '📋',
      title: "En-tête du plan",
      content:
        "L'en-tête affiche le titre, le statut actuel et les actions disponibles : modifier, supprimer, ou lier le plan à un projet. Le statut est cliquable pour le changer rapidement.",
      selector: '[data-tour="plan-detail-header"]',
      side: 'bottom',
      showControls: true,
      showSkip: true,
      pointerPadding: 8,
      pointerRadius: 12,
    },
    {
      icon: '🧭',
      title: 'Navigation par section',
      content:
        'Naviguez rapidement entre les sections du plan : Tasks, Constraints, Graph. Le compteur à côté de chaque section indique le nombre d\'éléments.',
      selector: '[data-tour="plan-detail-section-nav"]',
      side: 'bottom',
      showControls: true,
      showSkip: true,
      pointerPadding: 4,
      pointerRadius: 8,
    },
    {
      icon: '📊',
      title: 'Statistiques du plan',
      content:
        'Vue rapide des métriques : nombre de tâches par statut, priorité moyenne, progression globale. Ces chiffres se mettent à jour en temps réel.',
      selector: '[data-tour="plan-detail-stats"]',
      side: 'bottom',
      showControls: true,
      showSkip: true,
      pointerPadding: 8,
      pointerRadius: 12,
    },
    {
      icon: '✅',
      title: 'Les tâches du plan',
      content:
        "Chaque tâche a un titre, un statut, une priorité et des critères d'acceptation. Cliquez sur une tâche pour voir ses steps, décisions et dépendances. Le statut est cliquable pour le mettre à jour.",
      selector: '[data-tour="plan-detail-tasks"]',
      side: 'top',
      showControls: true,
      showSkip: true,
      pointerPadding: 8,
      pointerRadius: 12,
    },
    {
      icon: '⚠️',
      title: 'Contraintes du plan',
      content:
        "Les contraintes définissent les règles à respecter : performance, sécurité, compatibilité, style... Chaque contrainte a une sévérité (low à critical) pour prioriser l'attention.",
      selector: '[data-tour="plan-detail-constraints"]',
      side: 'top',
      showControls: true,
      showSkip: true,
      pointerPadding: 8,
      pointerRadius: 12,
    },
    {
      icon: '🕸️',
      title: 'Graphe de dépendances',
      content:
        "Le graphe visualise les dépendances entre les tâches. Les flèches montrent l'ordre d'exécution. Les nœuds colorés indiquent le statut. Identifiez le chemin critique d'un coup d'œil.",
      selector: '[data-tour="plan-detail-graph"]',
      side: 'top',
      showControls: true,
      showSkip: false,
      pointerPadding: 8,
      pointerRadius: 12,
    },
  ],
}
