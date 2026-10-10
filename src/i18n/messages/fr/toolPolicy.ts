import type { Translation } from '../../catalog.ts'

export default {
  neutral: {
    trust: "Rock'n roll",
    auto_edits: 'Approuver les modifications automatiquement',
    ask: 'Demander',
    plan_only: 'Plan seulement',
  },
  composer: {
    trust: "Rock'n roll",
    auto_edits: 'Accepter les modifications',
    ask: 'Par défaut',
    plan_only: 'Plan seulement',
  },
  session: {
    trust: "Rock'n roll",
    auto_edits: 'Accepter les modifications',
    ask: 'Demander les autorisations',
    plan_only: 'Mode plan',
  },
  native: {
    auto: { short: 'Auto', long: 'Mode auto' },
    dontAsk: { short: 'Ne pas demander', long: 'Ne pas demander' },
  },
  settings: {
    claude: {
      trust: { label: "Rock'n roll", description: 'Approuve tous les outils automatiquement. Aucune confirmation.' },
      auto_edits: { label: 'Accepter les modifications', description: 'Approuve les modifications de fichiers, demande pour les commandes.' },
      ask: { label: 'Par défaut', description: 'Demande confirmation pour tout usage d\'outil.' },
      plan_only: { label: 'Plan seulement', description: 'Lecture seule. Ni écriture ni commande.' },
    },
    neutral: {
      trust: { description: 'Exécute chaque outil sans demander.' },
      auto_edits: { description: 'Les modifications de fichiers s\'exécutent sans demander ; les commandes demandent toujours.' },
      ask: { description: 'Demande avant chaque appel d\'outil.' },
      plan_only: { description: 'Lecture seule. Ni écriture ni commande.' },
    },
  },
  setup: {
    trust: {
      label: "Rock'n roll",
      description: 'Tous les outils sont approuvés automatiquement — aucune demande d\'autorisation',
      summary: "Rock'n roll (tout approuvé automatiquement)",
    },
    ask: {
      label: 'Par défaut',
      description: 'Demande l\'approbation pour les modifications de fichiers et les commandes shell',
      summary: 'Par défaut (demande pour les modifications et le shell)',
    },
    auto_edits: {
      label: 'Accepter les modifications',
      description: 'Modifications de fichiers approuvées automatiquement, commandes shell soumises à approbation',
      summary: 'Accepter les modifications (demande pour le shell seulement)',
    },
    plan_only: {
      label: 'Plan seulement',
      description: 'Lecture seule — Claude peut lire les fichiers mais pas les modifier',
      summary: 'Plan seulement (lecture seule)',
    },
  },
  trustRequiresSandbox: 'Indisponible : cette machine distante n\'autorise pas ce mode. Activez-le dans les réglages de l\'instance pour exécuter ses outils sans confirmation.',
  rulesUnsupported: 'Les règles d\'autorisation et de refus sont propres à Claude Code. Ce provider ne les applique pas, elles ne sont donc pas affichées : c\'est le mode d\'autorisation ci-dessus qui régit ses outils.',
  trustDowngraded: 'Le mode « Rock’n roll » a été remplacé par « Demander » : cette machine distante ne l\'autorise pas.',
} satisfies Translation<'toolPolicy'>
