import type { Tour } from 'nextstepjs'

/**
 * Workspace detail micro-tour — 4 steps covering a workspace's detail page.
 * Requires navigation to /workspaces/:slug.
 */
export const workspaceDetailTour: Tour = {
  tour: 'workspace-detail',
  steps: [
    {
      icon: '📦',
      title: 'Projets du workspace',
      content:
        "Un workspace regroupe plusieurs projets liés. Ajoutez vos projets ici pour avoir une vue unifiée de la progression, des milestones cross-projets et des dépendances entre services.",
      selector: '[data-tour="workspace-projects-grid"]',
      side: 'bottom',
      showControls: true,
      showSkip: true,
      pointerPadding: 8,
      pointerRadius: 12,
    },
    {
      icon: '🏁',
      title: 'Milestones cross-projets',
      content:
        "Les milestones de workspace peuvent regrouper des tâches de différents projets. Idéal pour suivre un objectif qui implique plusieurs équipes ou services (ex: migration API, nouvelle fonctionnalité fullstack).",
      selector: '[data-tour="workspace-milestones"]',
      side: 'bottom',
      showControls: true,
      showSkip: true,
      pointerPadding: 8,
      pointerRadius: 12,
    },
    {
      icon: '📄',
      title: 'Ressources partagées',
      content:
        "Référencez les contrats API (OpenAPI), schémas Protobuf, schémas GraphQL ou JSON partagés entre les projets du workspace. Chaque ressource peut être liée à un projet qui l'implémente.",
      selector: '[data-tour="workspace-resources"]',
      side: 'bottom',
      showControls: true,
      showSkip: true,
      pointerPadding: 8,
      pointerRadius: 12,
    },
    {
      icon: '🏗️',
      title: 'Composants et topologie',
      content:
        "Modélisez l'architecture de votre système : Service, Frontend, Worker, Database, MessageQueue, Cache, Gateway... Définissez les dépendances entre composants (HTTP, gRPC, AMQP) pour visualiser la topologie.",
      selector: '[data-tour="workspace-components"]',
      side: 'bottom',
      showControls: true,
      showSkip: false,
      pointerPadding: 8,
      pointerRadius: 12,
    },
  ],
}
