import type { Translation } from '../../catalog.ts'

export default {
  kindName: {
    run: "Lauf",
    workflow: "Workflow",
    agent: "Agent",
    shell: "Shell",
    monitor: "Monitor"
  },
  kindCount: {
    run: {
      one: "{count} Lauf",
      many: "{count} Läufe"
    },
    workflow: {
      one: "{count} Workflow",
      many: "{count} Workflows"
    },
    agent: {
      one: "{count} Agent",
      many: "{count} Agents"
    },
    shell: {
      one: "{count} Shell",
      many: "{count} Shells"
    },
    monitor: {
      one: "{count} Monitor",
      many: "{count} Monitore"
    }
  },
  row: {
    progress: "{settled}/{total} Agents",
    stopping: "wird beendet…",
    stoppingTitle: "Wird beendet…",
    stop: "Stopp",
    stopAria: "{title} stoppen",
    stopRun: "Diesen Lauf stoppen",
    show: "In der Unterhaltung anzeigen",
    showAria: "{title} in der Unterhaltung anzeigen",
    openConversation: "Zugehörige Unterhaltung öffnen",
    openConversationAria: "Unterhaltung von {title} öffnen",
    dashboard: "Runner-Dashboard öffnen",
    dashboardAria: "Runner-Dashboard von {title} öffnen"
  },
  bar: {
    tooFast: "Zu schnell abgebrochen — versuche es gleich noch einmal.",
    cancelFailed: "Aufgabe konnte nicht abgebrochen werden — nutze stattdessen den globalen Stopp.",
    runningAria: "Läuft: {summary}",
    stoppedOne: "{count} Unterprozess gestoppt.",
    stoppedMany: "{count} Unterprozesse gestoppt.",
    noPid: "Abbruch registriert, aber die PID des Unterprozesses war unbekannt — falls weiterhin Ticks eintreffen, nutze die globale Stopp-Schaltfläche."
  },
  cancel: {
    alreadyStopped: "bereits beendet",
    notStopped: "nicht beendet — nutze den globalen Stopp",
    alreadyStoppedNotice: "Bereits beendet — es lief nichts mehr.",
    retryNotice: "Noch nicht beendet — versuche es gleich noch einmal.",
    timeoutNotice: "Der Stopp wurde nicht rechtzeitig beantwortet — er kann noch erfolgen.",
    failedNotice: "Die Tools konnten nicht beendet werden — nutze stattdessen den globalen Stopp.",
    taskRefusedNotice: "Dieser Provider kann eine einzelne Hintergrundaufgabe nicht stoppen. Mit Stopp im Eingabefeld unterbrechen Sie den gesamten Zug."
  },
  agent: {
    subAgent: "Sub-Agent",
    toolOne: "{count} Tool",
    toolMany: "{count} Tools",
    running: "{count} laufend",
    runningIndicator: "Agent läuft..."
  },
  status: {
    spawning: "startet",
    running: "läuft",
    verifying: "wird geprüft",
    completed: "abgeschlossen",
    failed: "fehlgeschlagen",
    interrupted: "unterbrochen"
  },
  banner: {
    elapsed: "Verstrichen",
    cost: "Kosten",
    ram: "RAM (resident)",
    cpu: "CPU",
    pidTitle: "PID {pid} · {threads} Threads · {status}",
    viewAgent: "Unterhaltung dieses Agents ansehen",
    view: "Ansehen",
    interrupt: "Diesen Agent unterbrechen",
    runTitle: "Lauf {id}",
    runShort: "Lauf {id}",
    wave: "Welle {wave}",
    openDashboard: "Vollständiges Runner-Dashboard öffnen",
    dashboard: "Dashboard",
    spawning: "Agents werden gestartet…",
    noAgents: "Keine aktiven Agents",
    title: "Agentischer Modus",
    activeOne: "{count} Lauf aktiv",
    activeMany: "{count} Läufe aktiv",
    cumulative: "kumuliert {cost}"
  },
  pill: {
    title: "Agentischer Modus",
    state: {
      idle: "inaktiv",
      ready: "bereit",
      running: "läuft",
      completed: "abgeschlossen"
    },
    workingOne: "Agentischer Modus — {count} Agent arbeitet",
    workingMany: "Agentischer Modus — {count} Agents arbeiten",
    completedOne: "Agentischer Modus — {count} Lauf abgeschlossen",
    completedMany: "Agentischer Modus — {count} Läufe abgeschlossen",
    ready: "Agentischer Modus — bereit",
    streamingOne: "{count} Lauf streamt gerade. Das Banner unten zeigt die Agents in Echtzeit.",
    streamingMany: "{count} Läufe streamen gerade. Das Banner unten zeigt die Agents in Echtzeit.",
    more: "+ {count} weitere",
    readyNote: "Mit diesem Chat sind Pläne verknüpft, aber keiner streamt gerade.",
    ranOne: "{count} Lauf wurde aus diesem Chat gestartet. Keiner streamt gerade.",
    ranMany: "{count} Läufe wurden aus diesem Chat gestartet. Keiner streamt gerade.",
    openDashboard: "Runner-Dashboard öffnen"
  },
  bg: {
    title: "Hintergrundaktivität",
    listAria: "Hintergrundaktivitäten",
    summary: {
      running: "{count} laufend",
      queued: "{count} wartend",
      failed: "{count} fehlgeschlagen",
      done: "{count} erledigt",
      cancelled: "{count} abgebrochen",
      ended: "{count} beendet"
    }
  },
  card: {
    showMore: "Mehr anzeigen",
    showLess: "Weniger anzeigen",
    lineOne: "{count} Zeile",
    lineMany: "{count} Zeilen",
    earlierLineOne: "{count} frühere Zeile anzeigen",
    earlierLineMany: "{count} frühere Zeilen anzeigen",
    progressOf: "Fortschritt von {title}",
    agents: "{settled}/{total} Agents",
    agentsOf: "Agents von {title}",
    tokens: "{count} Tokens",
    toolUseOne: "{count} Tool-Aufruf",
    toolUseMany: "{count} Tool-Aufrufe",
    timeline: "Zeitverlauf",
    eventOne: "{count} Ereignis",
    eventMany: "{count} Ereignisse",
    eventsOf: "Ereignisse von {title}",
    hiddenEventOne: "… {count} früheres Ereignis nicht aufbewahrt",
    hiddenEventMany: "… {count} frühere Ereignisse nicht aufbewahrt",
    rawPayload: "Rohdaten",
    parameters: "Parameter",
    latestOutput: "Neueste Ausgabe",
    output: "Ausgabe",
    kind: {
      workflow: "Workflow",
      shell: "Hintergrundbefehl",
      monitor: "Monitor",
      agent: "Sub-Agent",
      generic: "Hintergrundaktivität"
    },
    status: {
      running: "Läuft",
      queued: "Wartend",
      done: "Erledigt",
      failed: "Fehlgeschlagen",
      cancelled: "Abgebrochen",
      ended: "Beendet"
    }
  },
  runs: {
    finished: "Beendet",
    view: "Lauf ansehen",
    stop: "Lauf stoppen",
    loading: "Ausführungen werden geladen…",
    noDetails: "Keine Ausführungsdetails verfügbar.",
    inProgressOne: "{count} Lauf in Arbeit",
    inProgressMany: "{count} Läufe in Arbeit",
    completedOne: "{count} Lauf abgeschlossen",
    completedMany: "{count} Läufe abgeschlossen",
    done: "{count} erledigt"
  }
} satisfies Translation<'chatA-activity'>
