import type { Tour } from 'nextstepjs'

/**
 * Main tour — 10-step cross-page discovery of the application.
 * First tour offered to new users via the TutorialWelcome modal.
 * Uses nextRoute to navigate between pages via React Router adapter.
 */
export const mainTour: Tour = {
  tour: 'main-tour',
  steps: [
    // Step 1 — Sidebar navigation
    {
      icon: '🧭',
      title: 'Votre navigation principale',
      content:
        'La barre latérale organise toutes les fonctionnalités en 3 groupes : Organiser (workspaces, projets, milestones), Planifier (plans, tâches), et Connaissances (notes, code). Cliquez sur une section pour y accéder.',
      selector: '[data-tour="sidebar-nav"]',
      side: 'right',
      showControls: true,
      showSkip: true,
      pointerPadding: 8,
      pointerRadius: 12,
    },
    // Step 2 — WebSocket status
    {
      icon: '🟢',
      title: 'Connexion en temps réel',
      content:
        'Ce point indique la connexion WebSocket avec le backend. Vert = connecté, orange = reconnexion, gris = déconnecté. Les mises à jour arrivent automatiquement sans recharger la page.',
      selector: '[data-tour="ws-status"]',
      side: 'bottom',
      showControls: true,
      showSkip: true,
      pointerPadding: 12,
      pointerRadius: 16,
    },
    // Step 3 — Chat toggle
    {
      icon: '💬',
      title: 'Votre assistant IA',
      content:
        "Cliquez ici pour ouvrir le panneau de chat IA. Vous pouvez discuter avec Claude pour planifier, coder, explorer le code ou gérer vos projets. L'assistant connaît toute votre base de code.",
      selector: '[data-tour="chat-toggle"]',
      side: 'left-bottom',
      showControls: true,
      showSkip: true,
      pointerPadding: 8,
      pointerRadius: 12,
    },
    // Step 4 — Quick Actions (chat must be open with welcome screen)
    {
      icon: '⚡',
      title: 'Actions rapides',
      content:
        "Les raccourcis pour les actions les plus courantes : créer un plan, chercher dans le code, lancer une analyse d'impact... Cliquez sur une action pour démarrer une conversation pré-remplie.",
      selector: '[data-tour="chat-quick-actions"]',
      side: 'left',
      showControls: true,
      showSkip: true,
      pointerPadding: 8,
      pointerRadius: 12,
    },
    // Step 5 — Projects page
    {
      icon: '📦',
      title: 'Vos projets',
      content:
        "Chaque projet correspond à un dépôt de code. Synchronisez-le pour construire le graphe de connaissances : fonctions, types, imports, appels entre fichiers. L'IA utilise ce graphe pour vous aider.",
      selector: '[data-tour="projects-list"]',
      side: 'top',
      showControls: true,
      showSkip: true,
      pointerPadding: 8,
      pointerRadius: 12,
      nextRoute: '/projects',
    },
    // Step 6 — Plans page
    {
      icon: '📋',
      title: 'Vos plans de développement',
      content:
        'Un plan structure un objectif en tâches, steps, contraintes et décisions architecturales. Créez un plan pour chaque feature, refactoring ou bug fix important.',
      selector: '[data-tour="plans-list"]',
      side: 'top',
      showControls: true,
      showSkip: true,
      pointerPadding: 8,
      pointerRadius: 12,
      nextRoute: '/plans',
      prevRoute: '/projects',
    },
    // Step 7 — Kanban view toggle
    {
      icon: '📊',
      title: 'Vue Kanban',
      content:
        'Basculez entre la vue liste et la vue Kanban pour visualiser vos plans par statut. Glissez-déposez les cartes entre les colonnes pour changer le statut rapidement.',
      selector: '[data-tour="plan-view-toggle"]',
      side: 'bottom',
      showControls: true,
      showSkip: true,
      pointerPadding: 4,
      pointerRadius: 8,
    },
    // Step 8 — Notes page
    {
      icon: '📝',
      title: 'Base de connaissances',
      content:
        "Les notes capturent le savoir de votre projet : guidelines, gotchas, patterns, tips... L'IA les consulte automatiquement avant de travailler pour respecter vos conventions.",
      selector: '[data-tour="notes-list"]',
      side: 'top',
      showControls: true,
      showSkip: true,
      pointerPadding: 8,
      pointerRadius: 12,
      nextRoute: '/notes',
      prevRoute: '/plans',
    },
    // Step 9 — Code explorer
    {
      icon: '🔍',
      title: 'Exploration du code',
      content:
        'Recherchez dans votre code en langage naturel grâce à la recherche sémantique. Trouvez des fonctions, des patterns ou des concepts sans connaître le nom exact.',
      selector: '[data-tour="code-search"]',
      side: 'bottom',
      showControls: true,
      showSkip: true,
      pointerPadding: 8,
      pointerRadius: 12,
      nextRoute: '/code',
      prevRoute: '/notes',
    },
    // Step 10 — Tutorial button
    {
      icon: '🎉',
      title: "C'est parti !",
      content:
        "Vous connaissez maintenant les bases de Project Orchestrator. Chaque page dispose d'un tour dédié avec plus de détails. Relancez n'importe quel tour via ce bouton.",
      selector: '[data-tour="tutorial-button"]',
      side: 'left-bottom',
      showControls: true,
      showSkip: false,
      pointerPadding: 8,
      pointerRadius: 12,
      nextRoute: '/workspaces',
      prevRoute: '/code',
    },
  ],
}
