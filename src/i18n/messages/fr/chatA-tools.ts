import type { Translation } from '../../catalog.ts'

export default {
  bash: {
    emptyCommand: "(commande vide)",
    showLess: "afficher moins",
    showMore: "afficher {count} caractères de plus",
    noOutput: "aucune sortie",
    running: "en cours..."
  },
  default: {
    input: "Entrée",
    error: "Erreur",
    result: "Résultat",
    truncated: "... (tronqué)"
  },
  edit: {
    replaceAll: "tout remplacer",
    removedLineOne: "-{count} ligne",
    removedLineMany: "-{count} lignes",
    addedLineOne: "+{count} ligne",
    addedLineMany: "+{count} lignes",
    moreRemovedOne: "... {count} ligne supprimée de plus",
    moreRemovedMany: "... {count} lignes supprimées de plus",
    moreAddedOne: "... {count} ligne ajoutée de plus",
    moreAddedMany: "... {count} lignes ajoutées de plus",
    truncated: "... (tronqué)",
    editing: "modification..."
  },
  chat: {
    you: "Vous",
    assistant: "Assistant",
    messageOne: "{count} message",
    messageMany: "{count} messages"
  },
  code: {
    copyPath: "Copier le chemin",
    noResults: "Aucun résultat",
    searchResults: "Résultats de recherche",
    noSymbols: "Aucun symbole trouvé",
    noReferences: "Aucune référence trouvée",
    unknownFile: "(inconnu)",
    references: "Références",
    calledBy: "Appelée par",
    calls: "Appelle",
    noCallGraph: "Aucune donnée de graphe d’appels",
    callersColon: "appelants :",
    dependentFiles: "Fichiers dépendants",
    mostConnected: "Fichiers les plus connectés",
    imports: "Imports",
    importedBy: "Importé par",
    label: {
      results: "résultats",
      files: "fichiers",
      callers: "appelants",
      callees: "appelés",
      imports: "imports",
      dependents: "dépendants"
    },
    cat: {
      functions: "fonctions",
      structs: "structs",
      enums: "enums",
      traits: "traits",
      impls: "impls",
      macros: "macros",
      constants: "constantes",
      type_aliases: "alias de type"
    },
    symbols: {
      implementations: "Implémentations",
      traits: "Traits",
      impls: "Blocs impl"
    },
    symbolsNone: {
      implementations: "Aucune implémentation trouvée",
      traits: "Aucun trait trouvé",
      impls: "Aucun bloc impl trouvé"
    }
  },
  entity: {
    project: "projet",
    created: "créé",
    plan: "plan",
    path: "chemin",
    synced: "synchronisé",
    target: "cible",
    verify: "vérification",
    tasks: "Tâches",
    constraints: "Contraintes",
    criteria: "Critères d’acceptation",
    steps: "Étapes",
    decisions: "Décisions",
    label: {
      tasks: "tâches",
      constraints: "contraintes",
      criteria: "critères",
      steps: "étapes",
      decisions: "décisions"
    },
    type: {
      plan: "plan",
      task: "tâche",
      project: "projet",
      milestone: "jalon",
      workspace: "espace de travail",
      note: "note",
      release: "release"
    },
    view: {
      entity: "Voir {entity}",
      parentTask: "Voir la tâche parente",
      parentPlan: "Voir le plan parent",
      linkedTask: "Voir la tâche liée",
      linkedPlan: "Voir le plan lié"
    },
    deleted: "Supprimé",
    updated: "Mis à jour",
    createdVerb: "Créé",
    moreFields: "+{count} champs de plus"
  },
  list: {
    untitledPlan: "Plan sans titre",
    untitledSession: "Session sans titre",
    msgOne: "{count} msg",
    msgMany: "{count} msg",
    energy: "Niveau d’énergie",
    target: "cible : {date}",
    noResults: "Aucun résultat",
    resultOne: "{count} résultat",
    resultMany: "{count} résultats",
    matching: "correspondant à « {query} »"
  },
  viz: {
    noRadar: "Aucune donnée de radar disponible.",
    unknownTarget: "inconnu",
    direct: "Direct ({count})",
    transitive: "Transitif ({count})",
    total: "{count} au total",
    importance: {
      critical: "CRITIQUE",
      high: "ÉLEVÉE",
      medium: "MOYENNE",
      low: "FAIBLE"
    },
    kind: {
      guideline: "guideline",
      gotcha: "piège",
      pattern: "pattern",
      context: "contexte",
      tip: "astuce",
      observation: "observation",
      assertion: "assertion",
      decision: "décision"
    }
  },
  permission: {
    actions: "Répondre à cette demande d'autorisation",
    allowOnce: "Autoriser une fois",
    allowSession: "Pour la session",
    deny: "Refuser",
    sessionHint: "Plus demandé dans cette conversation pour cet appel exact",
    awaiting: "En attente de la confirmation…",
    sessionCovers: "« Pour la session » ne couvre que :",
    unconfirmed: "Aucune confirmation n'est revenue. Répondez à nouveau.",
    scopeRefused: "Cette autorisation ne peut pas être gardée pour la session (l'appel lance une autre commande, ou la session ne le propose pas). Répondez une fois ou refusez.",
    allowed: "Autorisé",
    allowedSession: "Autorisé pour la session",
    denied: "Refusé"
  }
} satisfies Translation<'chatA-tools'>
