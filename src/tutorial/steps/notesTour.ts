import type { Tour } from 'nextstepjs'

/**
 * Notes micro-tour — 5 steps covering the knowledge notes page.
 * Requires navigation to /notes.
 */
export const notesTour: Tour = {
  tour: 'notes',
  steps: [
    {
      icon: '📝',
      title: 'Vos notes de connaissance',
      content:
        "Les notes capturent le savoir de votre projet. Il existe 7 types :\n• **Guideline** — règles et conventions à suivre\n• **Gotcha** — pièges et subtilités à connaître\n• **Pattern** — patterns architecturaux récurrents\n• **Context** — contexte métier ou technique\n• **Tip** — astuces et bonnes pratiques\n• **Observation** — constatations et métriques\n• **Assertion** — hypothèses à vérifier",
      selector: '[data-tour="notes-list"]',
      side: 'bottom',
      showControls: true,
      showSkip: true,
      pointerPadding: 8,
      pointerRadius: 12,
    },
    {
      icon: '🏷️',
      title: 'Filtrer par type',
      content:
        'Filtrez les notes par type pour retrouver rapidement ce que vous cherchez. Par exemple, affichez uniquement les Gotchas avant de modifier du code sensible, ou les Guidelines pour vérifier les conventions.',
      selector: '[data-tour="notes-type-filter"]',
      side: 'bottom',
      showControls: true,
      showSkip: true,
      pointerPadding: 4,
      pointerRadius: 8,
    },
    {
      icon: '📊',
      title: 'Filtrer par statut',
      content:
        "Chaque note a un cycle de vie : Active (valide), Needs Review (à vérifier), Stale (potentiellement obsolète), Obsolete (invalidée), Archived. Le score de fraîcheur aide à identifier les notes à reconfirmer.",
      selector: '[data-tour="notes-status-filter"]',
      side: 'bottom',
      showControls: true,
      showSkip: true,
      pointerPadding: 4,
      pointerRadius: 8,
    },
    {
      icon: '➕',
      title: 'Créer une note',
      content:
        "Capturez une connaissance dès que vous la découvrez : un piège résolu, un pattern identifié, une convention établie. L'IA consulte automatiquement ces notes avant de travailler sur votre code.",
      selector: '[data-tour="notes-create-btn"]',
      side: 'bottom',
      showControls: true,
      showSkip: false,
      pointerPadding: 4,
      pointerRadius: 8,
    },
  ],
}
