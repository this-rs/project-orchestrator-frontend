/**
 * Glossary of technical terms used in the Project Orchestrator.
 * Each entry provides a human-readable label and a plain-language description.
 */

export interface GlossaryEntry {
  /** Display label */
  label: string
  /** Plain-language explanation */
  description: string
}

export const glossary: Record<string, GlossaryEntry> = {
  energy: {
    label: 'Energy',
    description:
      "Niveau d'activité récente d'un élément. Plus l'énergie est haute, plus l'élément est activement travaillé.",
  },
  cohesion: {
    label: 'Cohésion',
    description:
      'Mesure de la solidité interne d\'un module ou composant. Une cohésion élevée signifie que les éléments sont fortement liés entre eux.',
  },
  synapse: {
    label: 'Synapse',
    description:
      'Connexion entre deux éléments du projet (notes, tâches, fichiers). Représente une relation de dépendance ou de contexte.',
  },
  scar: {
    label: 'Cicatrice (Scar)',
    description:
      'Trace laissée par un problème passé. Aide à éviter de répéter les mêmes erreurs en signalant les zones fragiles.',
  },
  moat: {
    label: 'Fossé (Moat)',
    description:
      "Barrière de protection autour d'un composant critique. Indique qu'il faut être prudent lors de modifications.",
  },
  spreading_activation: {
    label: 'Activation par propagation',
    description:
      "Mécanisme qui propage l'importance d'un élément à ses voisins dans le graphe, comme une onde dans un réseau.",
  },
  fabric: {
    label: 'Tissu (Fabric)',
    description:
      "Le réseau de connaissances du projet — l'ensemble des connexions entre notes, décisions, et code.",
  },
  trajectory: {
    label: 'Trajectoire',
    description:
      "Historique du parcours d'un agent ou d'une tâche à travers les étapes du projet.",
  },
  protocol: {
    label: 'Protocole',
    description:
      'Machine à états finis décrivant un workflow. Définit les transitions valides entre statuts.',
  },
  persona: {
    label: 'Persona',
    description:
      'Profil spécialisé assigné à un agent pour orienter son comportement et ses compétences.',
  },
  episode: {
    label: 'Épisode',
    description:
      "Session de travail enregistrée d'un agent, avec les actions effectuées et les résultats obtenus.",
  },
  neural_routing: {
    label: 'Routage neuronal',
    description:
      "Système intelligent de distribution des tâches aux agents, basé sur leurs compétences et la charge de travail.",
  },
  milestone: {
    label: 'Jalon (Milestone)',
    description:
      'Point de passage important dans le projet. Regroupe des tâches et marque une étape clé de progression.',
  },
  feature_graph: {
    label: 'Graphe de fonctionnalités',
    description:
      'Visualisation des dépendances entre fonctionnalités du projet, montrant quelles features dépendent les unes des autres.',
  },
  lifecycle_hook: {
    label: 'Hook de cycle de vie',
    description:
      "Action automatique déclenchée lors d'un changement de statut (ex: notification quand une tâche passe à 'completed').",
  },
  constraint: {
    label: 'Contrainte',
    description:
      "Règle ou limitation qui s'applique à une tâche ou un plan. Doit être respectée pour considérer le travail comme valide.",
  },
  decision: {
    label: 'Décision',
    description:
      'Choix architectural ou technique enregistré avec son contexte et sa justification, pour référence future.',
  },
  component: {
    label: 'Composant',
    description:
      'Module fonctionnel du projet (backend, frontend, API, etc.) utilisé pour organiser le code et les responsabilités.',
  },
  workspace: {
    label: 'Espace de travail',
    description:
      "Conteneur isolé regroupant projets, tâches et ressources. Permet de séparer différents contextes de travail.",
  },
  skill: {
    label: 'Compétence (Skill)',
    description:
      "Capacité enregistrée d'un agent, décrivant ce qu'il sait faire et à quel niveau de maîtrise.",
  },
  release: {
    label: 'Release',
    description:
      "Version publiée du projet, regroupant un ensemble de changements prêts pour la mise en production.",
  },
  success_rate: {
    label: 'Taux de réussite',
    description:
      'Pourcentage de tâches complétées avec succès par cette persona. Reflète sa fiabilité sur les missions assignées.',
  },
  activation_count: {
    label: 'Activations',
    description:
      "Nombre de fois qu'un élément a été activé (utilisé par un agent). Plus le nombre est élevé, plus l'élément est sollicité.",
  },
  analysis_profile: {
    label: "Profil d'analyse",
    description:
      "Configuration définissant comment analyser un projet : quelles métriques calculer, quels seuils appliquer.",
  },
  co_change: {
    label: 'Co-changement',
    description:
      'Fichiers qui changent souvent ensemble. Un fort co-changement suggère un couplage (voulu ou accidentel).',
  },
  coupling: {
    label: 'Couplage',
    description:
      'Degré de dépendance entre deux modules. Un couplage faible est préférable pour la maintenabilité.',
  },
  churn: {
    label: 'Taux de modification (Churn)',
    description:
      "Fréquence à laquelle un fichier est modifié. Un churn élevé peut indiquer une zone instable ou en développement actif.",
  },
  hotspot: {
    label: 'Point chaud (Hotspot)',
    description:
      'Fichier fréquemment modifié et complexe. Les hotspots sont des zones à surveiller car elles concentrent les risques de bugs.',
  },
  orphan: {
    label: 'Fichier orphelin',
    description:
      "Fichier qui n'est ni importé ni exporté par d'autres fichiers. Peut indiquer du code mort ou un fichier mal intégré.",
  },
  dead_note: {
    label: 'Note morte',
    description:
      "Note sans énergie résiduelle — elle n'a pas été consultée ou modifiée depuis longtemps et risque d'être obsolète.",
  },
  stale_note: {
    label: 'Note périmée',
    description:
      "Note dont le contenu n'a pas été mis à jour depuis un certain temps et pourrait ne plus refléter l'état actuel du projet.",
  },
  god_function: {
    label: 'Fonction géante (God Function)',
    description:
      'Fonction excessivement longue ou complexe qui fait trop de choses. Devrait être découpée en fonctions plus petites.',
  },
  clustering_coefficient: {
    label: 'Coefficient de clustering',
    description:
      "Mesure la densité des connexions entre les voisins d'un nœud. Un coefficient élevé indique un groupe fortement interconnecté.",
  },
  knowledge_coverage: {
    label: 'Couverture des connaissances',
    description:
      'Ratio entre le nombre de notes/décisions et le nombre de fichiers de code. Indique si le code est bien documenté.',
  },
  note_freshness: {
    label: 'Fraîcheur des notes',
    description:
      'Proportion de notes encore à jour. Un taux bas signifie que beaucoup de notes nécessitent une relecture.',
  },
  synapse_quality: {
    label: 'Qualité des synapses',
    description:
      'Proportion de connexions solides dans le réseau. Les synapses faibles sont des liens peu fiables entre éléments.',
  },
  skills_maturity: {
    label: 'Maturité des compétences',
    description:
      "Ratio de compétences actives par rapport au total. Indique le niveau de maîtrise global de l'équipe sur le projet.",
  },
  code_safety: {
    label: 'Sécurité du code',
    description:
      "Score basé sur l'évaluation des risques. Tient compte des fichiers critiques, à haut risque et des vulnérabilités.",
  },
  health_score: {
    label: 'Score de santé',
    description:
      'Score global combinant couverture des connaissances, fraîcheur des notes, énergie neurale, qualité des synapses et maturité des compétences.',
  },
  circular_dependency: {
    label: 'Dépendance circulaire',
    description:
      "Situation où deux modules dépendent l'un de l'autre, créant une boucle. Rend le code plus difficile à maintenir et tester.",
  },
} as const

/** Get a glossary entry by key, or undefined if not found */
export function getGlossaryEntry(term: string): GlossaryEntry | undefined {
  return glossary[term.toLowerCase().replace(/[\s-]/g, '_')]
}

/** All glossary term keys */
export type GlossaryTerm = keyof typeof glossary
