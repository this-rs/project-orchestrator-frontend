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
    tooFast: "Annulations trop rapides — réessayez dans un instant.",
    cancelFailed: "Échec de l’annulation de la tâche — utilisez plutôt l’arrêt global.",
    runningAria: "En cours : {summary}",
    stoppedOne: "{count} sous-processus arrêté.",
    stoppedMany: "{count} sous-processus arrêtés.",
    noPid: "Annulation enregistrée, mais le PID du sous-processus était inconnu — si des signaux continuent d’arriver, utilisez le bouton d’arrêt global."
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
    kind: {
      workflow: "Workflow",
      shell: "Commande en arrière-plan",
      monitor: "Moniteur",
      agent: "Sous-agent",
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
  }
} satisfies Translation<'chatA-activity'>
