import type { Translation } from '../../catalog.ts'

export default {
  kindName: {
    run: "exécution",
    workflow: "workflow",
    agent: "agent",
    shell: "shell",
    monitor: "moniteur"
  },
  kindCount: {
    run: {
      one: "{count} exécution",
      many: "{count} exécutions"
    },
    workflow: {
      one: "{count} workflow",
      many: "{count} workflows"
    },
    agent: {
      one: "{count} agent",
      many: "{count} agents"
    },
    shell: {
      one: "{count} shell",
      many: "{count} shells"
    },
    monitor: {
      one: "{count} moniteur",
      many: "{count} moniteurs"
    }
  },
  row: {
    progress: "{settled}/{total} agents",
    stopping: "arrêt en cours…",
    stoppingTitle: "Arrêt en cours…",
    stop: "Arrêter",
    stopAria: "Arrêter {title}",
    stopRun: "Arrêter cette exécution",
    show: "Afficher dans la conversation",
    showAria: "Afficher {title} dans la conversation",
    openConversation: "Ouvrir sa conversation",
    openConversationAria: "Ouvrir la conversation de {title}",
    dashboard: "Ouvrir le tableau de bord du runner",
    dashboardAria: "Ouvrir le tableau de bord du runner de {title}"
  },
  bar: {
    acknowledge: "J’ai vérifié cette tâche — autoriser une nouvelle demande",
    runningAria: "En cours : {summary}",
    stoppedOne: "Signal accepté pour {count} processus. Il peut encore fonctionner.",
    stoppedMany: "Signal accepté pour {count} processus. Ils peuvent encore fonctionner.",
    noPid: "Aucun signal n’a été confirmé pour cette tâche. Le résultat est inconnu ; vérifiez son activité."
  },
  cancelAll: {
    open: "Arrêter les outils de la session, y compris ceux des sous-agents",
    explain: "Cette action envoie un signal d’interruption à tous les processus d’outils de cette session, sans arrêter le tour. Des processus peuvent ignorer le signal ou survivre. Vérifiez leur état réel ensuite. Les processus d’outils des sous-agents peuvent aussi être touchés lorsqu’ils sont descendants ; certains peuvent survivre.",
    confirm: "Envoyer l’interruption aux outils de la session et des sous-agents",
    back: 'Retour',
    sending: 'Envoi de l’interruption…',
    signalled: "Réponse reçue d’un propriétaire. Un signal ne garantit pas l’arrêt des processus ; d’autres opérations peuvent encore être en cours. Vérifiez l’activité de la session.",
    capped: "Un propriétaire a signalé une limite de fréquence. D’autres peuvent encore agir ; vérifiez la session avant de réessayer.",
    uncertain: 'Résultat inconnu. Le signal peut encore être envoyé ; vérifiez la session avant de réessayer.',
    refused: "Un refus a été reçu d’un moteur.",
    unsupported: "Ce fournisseur ne peut pas arrêter tous les outils de cette session.",
    ownerUnreachable: "Propriétaire injoignable ; aucun arrêt confirmé. Vérifiez l’activité de la session.",
    identityChanged: "Aucune demande envoyée : l’identité authentifiée n’a pas pu être vérifiée. Vérifiez votre session et reconnectez-vous si nécessaire.",
    reset: 'J’ai vérifié cette session — autoriser une nouvelle demande',
  },
  cancel: {
    unsupportedNotice: "Un refus a été reçu ; l’état de l’arrêt n’est pas confirmé. Vérifiez l’activité de la session.",
    unknownNotice: "Le résultat de cette demande d’arrêt est inconnu. Vérifiez l’activité de la session.",
    retryNotice: "Le résultat n’est pas confirmé. Vérifiez l’activité avant de réessayer l’arrêt de cette tâche.",
    timeoutNotice: "L’arrêt n’a pas reçu de réponse à temps — il peut encore avoir lieu.",
    taskRefusedNotice: "Un refus a été reçu ; l’état de l’arrêt n’est pas confirmé. Vérifiez l’activité de la session.",
    unauthenticatedNotice: 'Authentification refusée (401) : votre connexion est absente ou a expiré. Aucun arrêt n’a été confirmé ; reconnectez-vous, puis vérifiez l’activité de la session.',
    forbiddenNotice: 'Autorisation refusée (403) : ce compte n’a pas le droit d’arrêter ces outils. Aucun arrêt n’a été confirmé ; vérifiez l’activité de la session.',
  },
  stopDialog: {
    title: "Arrêter les outils de cette session",
    description: "Rien n’est envoyé tant que vous n’avez pas confirmé. Décochez ce qui doit continuer.",
    empty: "Aucune activité individuelle n’est listée. Confirmer arrête tous les outils de la session, y compris ceux au premier plan.",
    selected: "{selected} sur {total} sélectionnés",
    quick: {
      label: "Sélections rapides",
      all: "Tout",
      none: "Rien",
      onlyOld: "Seulement les anciens",
      onlyOldHint: "Décoche ce qui a démarré il y a moins de {minutes} minutes",
      keepBackground: "Garder les tâches de fond",
      keepMonitors: "Garder les moniteurs",
      keepAgents: "Garder les sous-agents",
    },
    group: { agent: "Sous-agents", background: "Tâches de fond", monitor: "Moniteurs", other: "Autres" },
    age: { unknown: "âge inconnu", lessThanMinute: "depuis moins d’1 min", minutes: "depuis {count} min", hours: "depuis {count} h" },
    alreadyRequested: "Un arrêt a déjà été demandé pour cette tâche.",
    foregroundWarning: "Les outils au premier plan ne sont pas arrêtés : ils n’ont pas d’identifiant individuel. Seul « Tout » les arrête.",
    untargetableWarning: "Éléments cochés qu’on ne peut pas arrêter un à un (sous-agents, runs) : {count}. Ils continuent sauf si tout est coché.",
    confirmOne: "Arrêter {count} élément",
    confirmMany: "Arrêter {count} éléments",
    cancel: "Annuler",
    close: "Fermer",
    resultsIntro: "Résultat pour chaque élément. Un signal ne garantit pas que le processus s’est arrêté.",
    results: "Résultats par élément",
  },
  agent: {
    subAgent: "Sous-agent",
    toolOne: "{count} outil",
    toolMany: "{count} outils",
    running: "{count} en cours",
    runningIndicator: "Agent en cours d’exécution..."
  },
  status: {
    spawning: "en démarrage",
    running: "en cours",
    verifying: "en vérification",
    completed: "terminé",
    failed: "échoué",
    interrupted: "interrompu"
  },
  banner: {
    elapsed: "Écoulé",
    cost: "Coût",
    ram: "RAM (résidente)",
    cpu: "CPU",
    pidTitle: "PID {pid} · {threads} threads · {status}",
    viewAgent: "Voir la conversation de cet agent",
    view: "Voir",
    interrupt: "Interrompre cet agent",
    runTitle: "Exécution {id}",
    runShort: "exéc. {id}",
    wave: "Vague {wave}",
    openDashboard: "Ouvrir le tableau de bord complet du runner",
    dashboard: "Tableau de bord",
    spawning: "Démarrage des agents…",
    noAgents: "Aucun agent actif",
    title: "Mode agentique",
    activeOne: "{count} exécution active",
    activeMany: "{count} exécutions actives",
    cumulative: "cumulé {cost}"
  },
  pill: {
    title: "Mode agentique",
    state: {
      idle: "inactif",
      ready: "prêt",
      running: "en cours",
      completed: "terminé"
    },
    workingOne: "Mode agentique — {count} agent au travail",
    workingMany: "Mode agentique — {count} agents au travail",
    completedOne: "Mode agentique — {count} exécution terminée",
    completedMany: "Mode agentique — {count} exécutions terminées",
    ready: "Mode agentique — prêt",
    streamingOne: "{count} exécution en cours de streaming. Le bandeau ci-dessous montre les agents en temps réel.",
    streamingMany: "{count} exécutions en cours de streaming. Le bandeau ci-dessous montre les agents en temps réel.",
    more: "+ {count} de plus",
    readyNote: "Des plans liés existent sur ce chat, mais aucun n’est en cours de streaming.",
    ranOne: "{count} exécution lancée depuis ce chat. Aucune n’est en cours de streaming.",
    ranMany: "{count} exécutions lancées depuis ce chat. Aucune n’est en cours de streaming.",
    openDashboard: "Ouvrir le tableau de bord du runner"
  },
  bg: {
    title: "Activité en arrière-plan",
    listAria: "Activités en arrière-plan",
    noWork: "que des avis du fournisseur",
    noticeOne: "{count} avis du fournisseur",
    noticeMany: "{count} avis du fournisseur",
    noticesAria: "Avis du fournisseur — télémétrie, aucun travail",
    summary: {
      running: "{count} en cours",
      queued: "{count} en attente",
      failed: "{count} en échec",
      done: "{count} terminé(es)",
      cancelled: "{count} annulé(es)",
      ended: "{count} arrêté(es)"
    }
  },
  card: {
    showMore: "Afficher plus",
    showLess: "Afficher moins",
    lineOne: "{count} ligne",
    lineMany: "{count} lignes",
    earlierLineOne: "Afficher {count} ligne précédente",
    earlierLineMany: "Afficher {count} lignes précédentes",
    progressOf: "Progression de {title}",
    agents: "{settled}/{total} agents",
    agentsOf: "Agents de {title}",
    tokens: "{count} tokens",
    toolUseOne: "{count} appel d’outil",
    toolUseMany: "{count} appels d’outil",
    timeline: "Chronologie",
    eventOne: "{count} événement",
    eventMany: "{count} événements",
    eventsOf: "Événements de {title}",
    hiddenEventOne: "… {count} événement antérieur non conservé",
    hiddenEventMany: "… {count} événements antérieurs non conservés",
    rawPayload: "Données brutes",
    parameters: "Paramètres",
    latestOutput: "Dernière sortie",
    output: "Sortie",
    result: "Résultat",
    watched: "Sortie surveillée",
    outputInFile: "La sortie est allée dans le fichier de la tâche (ci-dessus) : le fournisseur ne la met pas dans le flux.",
    toolsAria: "Outils appelés",
    kind: {
      workflow: "Workflow",
      shell: "Commande en arrière-plan",
      monitor: "Moniteur",
      agent: "Sous-agent",
      message: "Agent de fond",
      notice: "Avis du fournisseur",
      generic: "Activité en arrière-plan"
    },
    status: {
      running: "En cours",
      queued: "En attente",
      done: "Terminé",
      failed: "Échec",
      cancelled: "Annulé",
      ended: "Arrêté"
    }
  },
  runs: {
    finished: "Terminée",
    view: "Voir l’exécution",
    stop: "Arrêter l’exécution",
    loading: "Chargement des exécutions…",
    noDetails: "Aucun détail d’exécution disponible.",
    inProgressOne: "{count} exécution en cours",
    inProgressMany: "{count} exécutions en cours",
    completedOne: "{count} exécution terminée",
    completedMany: "{count} exécutions terminées",
    done: "{count} terminé(es)"
  },
  work: {
    kind: {
      plan: "plan",
      task: "tâche"
    },
    steps: "étape {done}/{total}",
    openPlan: "Ouvrir le plan {title}",
    openTask: "Ouvrir la tâche {title}",
    plans: {
      one: "{count} plan",
      many: "{count} plans"
    },
    tasks: {
      one: "{count} tâche",
      many: "{count} tâches"
    },
    barAria: "En cours : {summary}",
    barAriaCurrent: "En cours : {summary} — tâche courante : {title}"
  }
} satisfies Translation<'chatA-activity'>
