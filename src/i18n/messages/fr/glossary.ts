import type { Translation } from '../../catalog.ts'

export default {
  energy: {
    label: 'Énergie',
    description: 'Niveau d\'activité récente d\'un élément. Plus l\'énergie est haute, plus on travaille activement sur l\'élément.',
  },
  cohesion: {
    label: 'Cohésion',
    description: 'Mesure de la solidité interne d\'un module ou d\'un composant. Une forte cohésion signifie que ses éléments sont étroitement liés entre eux.',
  },
  synapse: {
    label: 'Synapse',
    description: 'Connexion entre deux éléments du projet (notes, tâches, fichiers). Représente une relation de dépendance ou de contexte.',
  },
  scar: {
    label: 'Cicatrice',
    description: 'Trace laissée par un problème passé. Aide à ne pas refaire les mêmes erreurs en signalant les zones fragiles.',
  },
  moat: {
    label: 'Douve',
    description: 'Barrière protectrice autour d\'un composant critique. Signale que les changements à cet endroit demandent une attention particulière.',
  },
  spreading_activation: {
    label: 'Propagation d\'activation',
    description: 'Mécanisme qui transmet l\'importance d\'un élément à ses voisins dans le graphe, comme une onde dans un réseau.',
  },
  fabric: {
    label: 'Tissu',
    description: 'Le réseau de connaissances du projet — l\'ensemble des liens entre les notes, les décisions et le code.',
  },
  trajectory: {
    label: 'Trajectoire',
    description: 'Historique du chemin qu\'un assistant ou une tâche a suivi à travers les étapes du projet.',
  },
  protocol: {
    label: 'Protocole',
    description: 'Machine à états finis qui décrit un flux de travail. Définit les transitions valides entre les statuts.',
  },
  persona: {
    label: 'Persona',
    description: 'Profil spécialisé attribué à un assistant pour orienter son comportement et ses compétences.',
  },
  episode: {
    label: 'Épisode',
    description: 'Session de travail enregistrée d\'un assistant, avec les actions menées et les résultats obtenus.',
  },
  neural_routing: {
    label: 'Routage neuronal',
    description: 'Répartition intelligente des tâches entre les assistants, selon leurs compétences et leur charge de travail.',
  },
  milestone: {
    label: 'Objectif',
    description: 'Jalon important du projet. Regroupe des tâches et marque une étape clé de l\'avancement.',
  },
  feature_graph: {
    label: 'Graphe de fonctionnalités',
    description: 'Visualisation des dépendances entre les fonctionnalités du projet, montrant lesquelles dépendent de lesquelles.',
  },
  lifecycle_hook: {
    label: 'Hook de cycle de vie',
    description: 'Action automatique déclenchée par un changement de statut (par ex. une notification quand une tâche passe à « terminée »).',
  },
  constraint: {
    label: 'Contrainte',
    description: 'Règle ou limite qui s\'applique à une tâche ou à un plan. Elle doit être respectée pour que le travail soit considéré comme valide.',
  },
  decision: {
    label: 'Décision',
    description: 'Choix d\'architecture ou technique consigné avec son contexte et sa justification, pour s\'y référer plus tard.',
  },
  component: {
    label: 'Composant',
    description: 'Module fonctionnel du projet (backend, frontend, API…) qui sert à organiser le code et les responsabilités.',
  },
  workspace: {
    label: 'Espace de travail',
    description: 'Conteneur isolé qui regroupe des projets, des tâches et des ressources. Garde séparés les différents contextes de travail.',
  },
  skill: {
    label: 'Compétence',
    description: 'Capacité enregistrée d\'un assistant, qui décrit ce qu\'il sait faire et à quel niveau de maîtrise.',
  },
  release: {
    label: 'Version publiée',
    description: 'Version publiée du projet, qui regroupe un ensemble de changements prêts pour la production.',
  },
  success_rate: {
    label: 'Taux de réussite',
    description: 'Pourcentage de tâches menées à bien par cette persona. Reflète sa fiabilité sur les missions confiées.',
  },
  activation_count: {
    label: 'Activations',
    description: 'Nombre de fois qu\'un élément a été activé (utilisé par un assistant). Plus il est élevé, plus l\'élément est sollicité.',
  },
  analysis_profile: {
    label: 'Profil d\'analyse',
    description: 'Configuration qui définit comment analyser un projet : quelles mesures calculer, quels seuils appliquer.',
  },
  co_change: {
    label: 'Co-modification',
    description: 'Fichiers qui changent souvent ensemble. Une forte co-modification suggère un couplage (voulu ou accidentel).',
  },
  coupling: {
    label: 'Couplage',
    description: 'Degré de dépendance entre deux modules. Un faible couplage est préférable pour la maintenabilité.',
  },
  churn: {
    label: 'Taux de modification',
    description: 'Fréquence à laquelle un fichier est modifié (churn). Un taux élevé peut indiquer une zone instable ou en développement actif.',
  },
  hotspot: {
    label: 'Point chaud',
    description: 'Fichier complexe et souvent modifié. Les points chauds sont des zones à surveiller, car ils concentrent le risque de bugs.',
  },
  orphan: {
    label: 'Fichier orphelin',
    description: 'Fichier qui n\'est ni importé ni exporté par d\'autres fichiers. Peut indiquer du code mort ou un fichier mal intégré.',
  },
  dead_note: {
    label: 'Note morte',
    description: 'Note sans énergie résiduelle — elle n\'a pas été lue ni modifiée depuis longtemps et est probablement obsolète.',
  },
  stale_note: {
    label: 'Note périmée',
    description: 'Note dont le contenu n\'a pas été mis à jour depuis un moment et qui ne reflète peut-être plus l\'état actuel du projet.',
  },
  god_function: {
    label: 'Fonction fourre-tout',
    description: 'Fonction excessivement longue ou complexe, qui fait trop de choses. À découper en fonctions plus petites.',
  },
  clustering_coefficient: {
    label: 'Coefficient de regroupement',
    description: 'Mesure la densité des liens entre les voisins d\'un nœud. Un coefficient élevé indique un groupe très interconnecté.',
  },
  knowledge_coverage: {
    label: 'Couverture des connaissances',
    description: 'Rapport entre le nombre de notes et de décisions et le nombre de fichiers de code. Indique si le code est bien documenté.',
  },
  note_freshness: {
    label: 'Fraîcheur des notes',
    description: 'Part des notes encore à jour. Un taux faible signifie que beaucoup de notes demandent une relecture.',
  },
  synapse_quality: {
    label: 'Qualité des synapses',
    description: 'Part des connexions solides dans le réseau. Les synapses faibles sont des liens peu fiables entre les éléments.',
  },
  skills_maturity: {
    label: 'Maturité des compétences',
    description: 'Rapport entre les compétences actives et le total. Indique le niveau général de maîtrise de l\'équipe sur le projet.',
  },
  code_safety: {
    label: 'Sûreté du code',
    description: 'Score issu de l\'évaluation des risques. Tient compte des fichiers à risque critique ou élevé et des vulnérabilités.',
  },
  health_score: {
    label: 'Score de santé',
    description: 'Score global qui combine la couverture des connaissances, la fraîcheur des notes, l\'énergie neuronale, la qualité des synapses et la maturité des compétences.',
  },
  circular_dependency: {
    label: 'Dépendance circulaire',
    description: 'Situation où deux modules dépendent l\'un de l\'autre, ce qui crée une boucle. Rend le code plus difficile à maintenir et à tester.',
  },
} satisfies Translation<'glossary'>
