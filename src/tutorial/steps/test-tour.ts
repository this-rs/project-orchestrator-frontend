import type { Tour } from 'nextstepjs'

/**
 * Temporary test tour to validate that NextStepjs is properly wired.
 * This tour highlights the main structural elements of the layout.
 * Will be replaced by real tours in Plan 3.
 */
export const testTour: Tour = {
  tour: 'test-tour',
  steps: [
    {
      icon: '👋',
      title: 'Bienvenue !',
      content: 'Ceci est un tour de test pour vérifier que NextStepjs fonctionne correctement.',
      selector: '[data-tour="sidebar-nav"]',
      side: 'right',
      showControls: true,
      showSkip: true,
      pointerPadding: 8,
      pointerRadius: 12,
    },
    {
      icon: '🧭',
      title: 'Barre de navigation',
      content: 'Ici se trouvent le fil d\'Ariane et les indicateurs de statut.',
      selector: '[data-tour="header-breadcrumb"]',
      side: 'bottom',
      showControls: true,
      showSkip: true,
      pointerPadding: 4,
      pointerRadius: 8,
    },
    {
      icon: '🟢',
      title: 'Statut WebSocket',
      content: 'Ce point indique la connexion temps réel avec le backend.',
      selector: '[data-tour="ws-status"]',
      side: 'bottom',
      showControls: true,
      showSkip: true,
      pointerPadding: 12,
      pointerRadius: 16,
    },
    {
      icon: '💬',
      title: 'Chat IA',
      content: 'Cliquez ici pour ouvrir le panneau de chat avec l\'assistant IA.',
      selector: '[data-tour="chat-toggle"]',
      side: 'bottom-left',
      showControls: true,
      showSkip: true,
      pointerPadding: 8,
      pointerRadius: 12,
    },
    {
      icon: '🎉',
      title: 'C\'est tout !',
      content: 'Le système de didacticiel est opérationnel. Ce tour de test sera remplacé par de vrais tours guidés.',
      selector: '[data-tour="main-content"]',
      side: 'top',
      showControls: true,
      showSkip: false,
      pointerPadding: 16,
      pointerRadius: 12,
    },
  ],
}
