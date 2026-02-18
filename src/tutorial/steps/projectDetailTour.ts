import type { Tour } from 'nextstepjs'

/**
 * Project detail micro-tour — 4 steps covering a single project's detail page.
 * Requires navigation to /projects/:slug.
 */
export const projectDetailTour: Tour = {
  tour: 'project-detail',
  steps: [
    {
      icon: '🔄',
      title: 'Synchroniser le code',
      content:
        "Le bouton Sync analyse votre code source avec Tree-sitter et construit le graphe de connaissances : fonctions, types, imports, appels entre fichiers. C'est ce graphe qui permet la recherche sémantique et l'analyse d'impact.",
      selector: '[data-tour="project-sync-button"]',
      side: 'bottom',
      showControls: true,
      showSkip: true,
      pointerPadding: 8,
      pointerRadius: 12,
    },
    {
      icon: '🗺️',
      title: 'Roadmap du projet',
      content:
        'La roadmap regroupe vos milestones et releases. Les milestones marquent les jalons de progression avec une barre de progression basée sur les tâches complétées. Les releases versionnent vos livrables.',
      selector: '[data-tour="project-roadmap"]',
      side: 'top',
      showControls: true,
      showSkip: true,
      pointerPadding: 8,
      pointerRadius: 12,
    },
    {
      icon: '📋',
      title: 'Plans liés au projet',
      content:
        "Tous les plans de développement rattachés à ce projet. Chaque plan peut être déplié pour voir ses tâches et leur progression. Liez un plan existant ou consultez-les tous depuis cette section.",
      selector: '[data-tour="project-plans-section"]',
      side: 'top',
      showControls: true,
      showSkip: true,
      pointerPadding: 8,
      pointerRadius: 12,
    },
    {
      icon: '🕸️',
      title: 'Feature Graphs',
      content:
        "Les feature graphs capturent les entités de code (fonctions, fichiers, types) liées à une fonctionnalité. Construits automatiquement à partir d'un point d'entrée, ils aident à comprendre la portée d'une feature.",
      selector: '[data-tour="project-feature-graphs"]',
      side: 'top',
      showControls: true,
      showSkip: false,
      pointerPadding: 8,
      pointerRadius: 12,
    },
  ],
}
