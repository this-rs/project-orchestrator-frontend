import type { Translation } from '../../catalog.ts'

export default {
  modes: {
    primary: { label: 'Principal seul', description: 'Un seul provider principal exclusif, comme aujourd\'hui. PO note seulement ce qu\'il aurait choisi.' },
    mixed: { label: 'Mixte', description: 'Le principal pilote la conversation ; PO route les exécutants.' },
    full: { label: 'Complet', description: 'PO choisit tout et explique pourquoi.' },
  },
  stages: {
    shadow: { label: 'Observation', description: 'Rien n\'est appliqué ; chaque décision est enregistrée.' },
    advisory: { label: 'Conseil', description: 'PO suggère ; vous confirmez.' },
    auto: { label: 'Automatique', description: 'PO applique ses décisions.' },
  },
  routedBy: {
    session: 'Choisi pour la session',
    request: 'Choisi dans la requête',
    task: 'Choisi par la tâche',
    persona: 'Choisi par la persona',
    run: 'Choisi par le run',
    project_rule: 'Règle du projet',
    global_rule: 'Règle globale',
    default: 'Défaut du serveur',
    claude_code: 'Repli sur Claude Code',
    fallback: 'Chaîne de repli',
    auto: 'PO a choisi',
  },
  rejection: {
    not_allowed: 'Non autorisé pour ce projet',
    unhealthy: 'Hors service',
    no_tools: 'Ne sait pas appeler d\'outils',
    context_too_small: 'Fenêtre de contexte trop petite',
    no_images: 'Ne lit pas les images',
    over_budget: 'Budget dépassé',
    trust_without_sandbox: 'Mode confiance sans bac à sable',
    remote: 'Distant, non autorisé ici',
  },
  badge: { poChooses: 'PO choisit', why: 'Pourquoi ?' },
  advanced: { force: 'Forcer un provider' },
  settings: { title: 'Routage', confirmAuto: 'PO appliquera désormais ses propres choix sans demander. Continuer ?' },
  report: { agreement: 'Accord avec le choix réel', costDelta: 'Écart de coût estimé', unknown: 'Inconnu' },
} satisfies Translation<'routing'>
