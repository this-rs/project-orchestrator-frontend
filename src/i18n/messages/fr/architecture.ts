import type { Translation } from '../../catalog.ts'

export default {
  componentTypes: {
    service: 'Service',
    frontend: 'Frontend',
    worker: 'Worker',
    database: 'Base de données',
    message_queue: 'File',
    cache: 'Cache',
    gateway: 'Passerelle',
    external: 'Externe',
    library: 'Bibliothèque',
    cli: 'CLI',
    other: 'Autre',
  },
  tiers: {
    entry: "Points d'entrée",
    gateway: 'Passerelle',
    services: 'Services',
    libraries: 'Bibliothèques, messagerie et cache',
    data: 'Données et externes',
    other: 'Autre',
  },
  legend: {
    required: 'Requis',
    optional: 'Optionnel — le système fonctionne sans lui',
    direction: "De gauche à droite : où l'on entre → services → données",
    select: "Sélectionnez un composant pour voir ce qu'il entraînerait dans sa chute",
  },
  panel: {
    details: 'Détails de {name}',
    close: 'Fermer les détails',
    optional: 'optionnel',
    dependedOnBy: 'Dépendent de lui ({n})',
    dependsOn: 'Dépend de ({n})',
    nothingDependsOnThis: 'Rien ne dépend de ce composant.',
    dependsOnNothing: 'Ne dépend de rien.',
    derivedFrom: 'Dérivé de {source}',
  },
  description: 'Le système tel que construit : les composants et ce qui dépend de quoi.',
  loadFailed: "Échec du chargement de l'architecture",
  emptyTitle: "Pas encore d'architecture",
  emptyDescription:
    "Ajoutez des composants (services, bases de données, files…) à l'espace de travail, ou demandez à un assistant de cartographier le système.",
  graphLabel: "Graphe d'architecture",
  outline: "Plan de l'architecture",
} satisfies Translation<'architecture'>
