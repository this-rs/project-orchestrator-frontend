import type { Tour } from 'nextstepjs'

/**
 * Chat IA micro-tour — 8 steps covering the chat panel features.
 * Requires the chat panel to be open.
 */
export const chatTour: Tour = {
  tour: 'chat',
  steps: [
    {
      icon: '📂',
      title: 'Choisissez votre projet',
      content:
        "Le sélecteur de projet définit le contexte de toutes les actions IA. L'assistant accèdera au graphe de connaissances du projet sélectionné pour vous aider avec précision.",
      selector: '[data-tour="chat-project-select"]',
      side: 'bottom',
      showControls: true,
      showSkip: true,
      pointerPadding: 4,
      pointerRadius: 8,
    },
    {
      icon: '✏️',
      title: 'Votre message',
      content:
        'Tapez votre message ici en français ou en anglais. Le champ s\'agrandit automatiquement. Envoyez avec Entrée, ou Shift+Entrée pour un saut de ligne.',
      selector: '[data-tour="chat-input"]',
      side: 'top',
      showControls: true,
      showSkip: true,
      pointerPadding: 4,
      pointerRadius: 8,
    },
    {
      icon: '🤖',
      title: 'Choix du modèle',
      content:
        'Sélectionnez le modèle IA : Opus pour les tâches complexes (planification, architecture), Sonnet pour un bon équilibre, Haiku pour les questions simples et rapides.',
      selector: '[data-tour="chat-model-select"]',
      side: 'top',
      showControls: true,
      showSkip: true,
      pointerPadding: 4,
      pointerRadius: 8,
    },
    {
      icon: '🔒',
      title: "Permissions de l'IA",
      content:
        "Contrôlez ce que l'IA peut faire : Default (demande confirmation), Bypass (exécution libre), Accept Edits (accepte les modifications de fichiers), Plan (mode planification seule).",
      selector: '[data-tour="chat-permission-mode"]',
      side: 'top',
      showControls: true,
      showSkip: true,
      pointerPadding: 4,
      pointerRadius: 8,
    },
    {
      icon: '🔄',
      title: 'Continuation automatique',
      content:
        "Activez l'auto-continue pour que l'IA enchaîne automatiquement les étapes longues sans attendre votre validation à chaque tour. Idéal pour les tâches multi-steps.",
      selector: '[data-tour="chat-auto-continue"]',
      side: 'top-right',
      showControls: true,
      showSkip: true,
      pointerPadding: 4,
      pointerRadius: 8,
    },
    {
      icon: '🖥️',
      title: 'Mode plein écran',
      content:
        "Passez en mode plein écran pour une expérience de chat immersive avec la barre latérale des conversations et plus d'espace pour lire les réponses.",
      selector: '[data-tour="chat-fullscreen"]',
      side: 'left-top',
      showControls: true,
      showSkip: true,
      pointerPadding: 4,
      pointerRadius: 8,
    },
    {
      icon: '📚',
      title: 'Vos conversations',
      content:
        "Accédez à l'historique de toutes vos sessions de chat. Reprenez une conversation là où vous l'avez laissée, ou consultez les réponses précédentes.",
      selector: '[data-tour="chat-sessions-toggle"]',
      side: 'bottom',
      showControls: true,
      showSkip: true,
      pointerPadding: 4,
      pointerRadius: 8,
    },
    {
      icon: '⚙️',
      title: 'Paramètres de session',
      content:
        "Ajustez les paramètres de permission pour cette session. Les changements s'appliquent immédiatement à la conversation en cours.",
      selector: '[data-tour="chat-settings"]',
      side: 'left-top',
      showControls: true,
      showSkip: false,
      pointerPadding: 4,
      pointerRadius: 8,
    },
  ],
}
