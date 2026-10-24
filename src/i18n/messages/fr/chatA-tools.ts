import type { Translation } from '../../catalog.ts'

export default {
  agent: {
    asked: "Demandé au sous-agent",
    kind: "Type d’agent",
    answer: "Sa réponse",
    failed: "Le sous-agent a échoué",
    open: "Ouvrir la sous-conversation",
    openTitle: "Ouvrir la conversation dans laquelle ce sous-agent a travaillé",
    running: "Le sous-agent travaille encore…",
    noChild: "La sous-conversation n’est pas encore répertoriée",
    noChildTitle: "La conversation fille est retrouvée par l’identifiant de cet appel d’outil. Elle apparaît dès que le serveur la répertorie."
  },
  /** WebFetch / WebSearch: their result is data from the outside, never the assistant's text. */
  web: {
    externalSearch: "Résultats de recherche : contenu externe, non écrit par l'assistant",
    externalPage: "Contenu de la page : contenu externe, non écrit par l'assistant",
  },
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
    },
    iso: {
      loading: "Chargement de la scène 3D…",
      composing: "Scène 3D en cours d'écriture…",
      refused: "Cette scène 3D a été refusée — à corriger :",
      moreProblems: "… et {count} de plus",
      rebuild: "Reconstruire",
      notJson: "Cette scène 3D n'est pas du JSON valide ({detail}). Son texte :",
      notObject: "Cette scène 3D doit être un objet JSON. Son texte :",
      tooLarge: "Cette scène 3D est trop grande ({max} caractères au plus). Son texte :",
      fullscreen: "Plein écran",
      exitFullscreen: "Quitter le plein écran",
      live: {
        loading: "Lecture du plan…",
        unknownPlan: "Aucun plan {id} : rien à montrer en direct.",
        unreadable: "Le plan {id} n'a pas pu être lu ({detail}).",
        empty: "Ce plan n'a encore aucune tâche : la scène commence avec la première.",
        more: "+{count} autres",
        refused: "La scène a refusé une mise à jour :",
        label: "Plan en direct : {title}",
        status: {
          pending: "à faire",
          blocked: "bloquée",
          in_progress: "en cours",
          completed: "terminée",
          failed: "échouée",
          interrupted: "interrompue"
        }
      }
    },
    mermaid: {
      title: "Diagramme",
      loading: "Chargement du diagramme…",
      composing: "Diagramme en cours d'écriture…",
      refused: "Ce diagramme a été refusé — Mermaid indique :",
      empty: "Ce diagramme est vide.",
      tooLarge: "Ce diagramme est trop grand ({max} caractères au plus). Son texte :"
    },
    math: {
      composing: "Formule en cours d'écriture…",
      refused: "Cette formule a été refusée — KaTeX indique :",
      empty: "Cette formule est vide.",
      tooLarge: "Cette formule est trop longue ({max} caractères au plus). Son texte :"
    }
  },
  permission: {
    actions: "Répondre à cette demande d'autorisation",
    allowOnce: "Autoriser une fois",
    allowSession: "Pour la session",
    deny: "Refuser",
    sessionHint: "Plus demandé dans cette conversation pour cet appel exact",
    awaiting: "En attente de la confirmation…",
    sessionCovers: "Si elle est accordée, « Pour la session » ne couvre que :",
    forbidden: "Seule la personne à qui appartient cette conversation peut y répondre. Rien n'a été répondu.",
    ownerUnreadable: "Impossible de vérifier à qui appartient cette conversation. Rien n'a été répondu : réessayez.",
    unconfirmed: "Aucune confirmation n'est revenue. Répondez à nouveau.",
    scopeRefused: "Cette autorisation ne peut pas être gardée pour la session (l'appel lance une autre commande, ou la session ne le propose pas). Répondez une fois ou refusez.",
    allowed: "Autorisé",
    allowedSession: "Autorisé pour la session",
    denied: "Refusé",
    allowAlways: "Toujours",
    alwaysHint: "Plus demandé pour cet appel exact dans vos conversations de ce projet qui s'exécutent dans son dossier, sur cette machine ; redemandé si la conversation a changé de dossier",
    alwaysCovers: "Si elle est accordée, « Toujours » ne couvre que :",
    destinationHint: "Une destination réseau : ce que l'autorisation couvre est fixé par l'orchestrateur, et énoncé dès que vous répondez",
    destinationCovers: 'Cet appel atteint :',
    destinationAlwaysHint: 'Peut être enregistré comme consentement réseau de ce projet, listé et révocable dans Réglages → Outils réseau',
    destinationAlwaysCovers: '« Toujours » peut être enregistré comme consentement réseau de ce projet (Réglages → Outils réseau).',
    originQuestion: "Autoriser l’accès réseau à cette origine ?",
    originScopes: "Ce que couvre chaque réponse",
    originOnce: "Une fois : cet appel seulement. Rien n’est conservé.",
    originSession: "Pour cette session : toutes les pages de cette origine, jusqu’à la fin de la session. Rien n’est enregistré.",
    originSessionHint: "Toutes les pages de cette origine, pour cette session",
    originAlways: "Toujours : enregistré comme consentement réseau de ce projet pour :",
    originAlwaysRevocable: "Listé et révocable dans Réglages → Outils réseau.",
    originAlwaysHint: "Enregistré comme consentement réseau de ce projet, révocable dans Réglages → Outils réseau",
    alwaysRefused: "Cet appel ne peut pas être autorisé pour toujours (seuls une lecture exacte, ou une commande en lecture seule sans redirection ni enchaînement, le peuvent). Répondez une fois ou pour la session.",
    allowedAlways: "Toujours autorisé"
  },
  lastingRules: {
    title: "Appels toujours autorisés",
    description: "Les appels que vous avez autorisés pour toujours, par projet. Chacun ne couvre que cet appel exact, dans les conversations qui s'exécutent dans le dossier du projet sur cette machine. Révoqué, il est redemandé dès la requête suivante sur cette machine.",
    empty: "Aucun appel n'est autorisé pour toujours.",
    disabled: "Ce serveur ne garde aucune autorisation durable.",
    revoke: "Révoquer",
    revoked: "Révoqué : redemandé dès la requête suivante sur cette machine.",
    loadFailed: "Impossible de charger vos autorisations durables.",
    revokeFailed: "Impossible de la révoquer. Réessayez.",
    notHeld: "Ne s'applique plus",
    engineNative: "moteur natif",
    engineClaudeCode: "Claude Code",
    sandboxDisabled: "hors du bac à sable"
  }
} satisfies Translation<'chatA-tools'>
