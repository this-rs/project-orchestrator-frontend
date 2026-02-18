import type { Tour } from 'nextstepjs'

/**
 * Code Explorer micro-tour — 4 steps covering the code exploration page.
 * Requires navigation to /code.
 */
export const codeTour: Tour = {
  tour: 'code-explorer',
  steps: [
    {
      icon: '🔍',
      title: 'Onglets Search / Architecture',
      content:
        "Deux modes d'exploration : **Search** pour chercher dans le code en langage naturel, et **Architecture** pour une vue d'ensemble de la structure du projet (fichiers clés, langages, modules).",
      selector: '[data-tour="code-tabs"]',
      side: 'bottom',
      showControls: true,
      showSkip: true,
      pointerPadding: 4,
      pointerRadius: 8,
    },
    {
      icon: '✨',
      title: 'Recherche sémantique',
      content:
        "Contrairement à grep qui cherche des chaînes exactes, la recherche sémantique comprend le **sens** de votre requête. Tapez « gestion des erreurs API » pour trouver du code lié, même s'il n'utilise pas ces mots exacts.",
      selector: '[data-tour="code-search"]',
      side: 'bottom',
      showControls: true,
      showSkip: true,
      pointerPadding: 4,
      pointerRadius: 8,
    },
    {
      icon: '📄',
      title: 'Résultats de recherche',
      content:
        "Chaque résultat affiche le chemin du fichier, le langage, un score de pertinence, les symboles (fonctions, types) et les signatures. Plus le score est élevé, plus le résultat correspond à votre requête.",
      selector: '[data-tour="code-results"]',
      side: 'top',
      showControls: true,
      showSkip: true,
      pointerPadding: 8,
      pointerRadius: 12,
    },
    {
      icon: '🏗️',
      title: 'Vue Architecture',
      content:
        "La vue Architecture donne un aperçu global : nombre de fichiers, langages utilisés, fichiers clés (les plus connectés dans le graphe de dépendances), et modules détectés. Idéal pour découvrir un nouveau projet.",
      selector: '[data-tour="code-tabs"]',
      side: 'bottom',
      showControls: true,
      showSkip: false,
      pointerPadding: 4,
      pointerRadius: 8,
    },
  ],
}
