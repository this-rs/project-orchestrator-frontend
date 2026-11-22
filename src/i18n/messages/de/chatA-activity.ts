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
    acknowledge: "Ich habe diese Aufgabe geprüft — weitere Anfrage erlauben",
    runningAria: "Läuft: {summary}",
    stoppedOne: "Signal für {count} Prozess angenommen. Er kann noch laufen.",
    stoppedMany: "Signal für {count} Prozesse angenommen. Sie können noch laufen.",
    noPid: "Für diese Aufgabe wurde kein Signal bestätigt. Das Ergebnis ist unbekannt; prüfen Sie ihre Aktivität."
  },
  cancelAll: {
    open: "Sitzungswerkzeuge einschließlich der Werkzeuge von Unteragenten stoppen",
    explain: "Dies sendet ein Unterbrechungssignal an alle Werkzeugprozesse dieser Sitzung, während der Durchlauf weiterläuft. Prozesse können das Signal ignorieren oder weiterlaufen. Prüfen Sie danach den tatsächlichen Zustand. Werkzeugprozesse von Unteragenten können ebenfalls betroffen sein, wenn sie Nachkommen sind; einige können weiterlaufen.",
    confirm: "Unterbrechung an Sitzungs- und Unteragentenwerkzeuge senden",
    back: "Zurück",
    sending: "Unterbrechung wird gesendet…",
    signalled: "Antwort von einem Besitzer erhalten. Ein Signal garantiert nicht das Prozessende; andere Vorgänge können noch laufen. Prüfen Sie die Sitzungsaktivität.",
    capped: "Ein Besitzer meldete eine Ratenbegrenzung. Andere können noch handeln; prüfen Sie die Sitzung vor einem erneuten Versuch.",
    uncertain: "Ergebnis unbekannt. Das Signal kann noch gesendet werden; prüfen Sie die Sitzung vor einem erneuten Versuch.",
    refused: "Eine Ablehnung von einer Engine wurde empfangen.",
    unsupported: "Dieser Anbieter kann nicht alle Werkzeuge dieser Sitzung stoppen.",
    ownerUnreachable: "Besitzer nicht erreichbar; kein Stopp bestätigt. Prüfen Sie die Sitzungsaktivität.",
    identityChanged: "Keine Anfrage gesendet: Die angemeldete Identität konnte nicht überprüft werden. Prüfen Sie die Sitzung und melden Sie sich bei Bedarf erneut an.",
    reset: "Ich habe diese Sitzung geprüft — weitere Anfrage erlauben",
  },
  cancel: {
    unsupportedNotice: "Eine Ablehnung wurde empfangen; der Stopp ist nicht bestätigt. Prüfen Sie die Sitzungsaktivität.",
    unknownNotice: "Das Ergebnis dieser Stoppanfrage ist unbekannt. Prüfen Sie die Sitzungsaktivität.",
    retryNotice: "Das Ergebnis ist nicht bestätigt. Prüfen Sie die Aktivität, bevor Sie das Stoppen dieser Aufgabe erneut versuchen.",
    timeoutNotice: "Der Stopp wurde nicht rechtzeitig beantwortet — er kann noch erfolgen.",
    taskRefusedNotice: "Eine Ablehnung wurde empfangen; der Stopp ist nicht bestätigt. Prüfen Sie die Sitzungsaktivität.",
    unauthenticatedNotice: 'Authentifizierung abgelehnt (401): Ihre Anmeldung fehlt oder ist abgelaufen. Kein Stopp wurde bestätigt; melden Sie sich erneut an und prüfen Sie dann die Sitzungsaktivität.',
    forbiddenNotice: 'Autorisierung abgelehnt (403): Dieses Konto darf diese Werkzeuge nicht stoppen. Kein Stopp wurde bestätigt; prüfen Sie die Sitzungsaktivität.',
  },
  stopDialog: {
    title: "Werkzeuge dieser Sitzung stoppen",
    description: "Nichts wird gesendet, bevor Sie bestätigen. Entfernen Sie das Häkchen bei dem, was weiterlaufen soll.",
    empty: "Keine einzelne Aktivität aufgelistet. Bestätigen stoppt alle Werkzeuge der Sitzung, auch die im Vordergrund.",
    selected: "{selected} von {total} ausgewählt",
    quick: {
      label: "Schnellauswahl",
      all: "Alle",
      none: "Keine",
      onlyOld: "Nur die alten",
      onlyOldHint: "Entfernt das Häkchen bei allem, was vor weniger als {minutes} Minuten gestartet ist",
      keepBackground: "Hintergrundaufgaben behalten",
      keepMonitors: "Monitore behalten",
      keepAgents: "Sub-Agenten behalten",
    },
    group: { agent: "Sub-Agenten", background: "Hintergrundaufgaben", monitor: "Monitore", other: "Sonstige" },
    age: { unknown: "Alter unbekannt", lessThanMinute: "seit weniger als 1 Min.", minutes: "seit {count} Min.", hours: "seit {count} Std." },
    alreadyRequested: "Für diese Aufgabe wurde bereits ein Stopp angefordert.",
    foregroundWarning: "Werkzeuge im Vordergrund werden nicht gestoppt: Sie haben keine eigene Kennung. Nur „Alle“ stoppt sie.",
    untargetableWarning: "Markierte Einträge, die sich nicht einzeln stoppen lassen (Sub-Agenten, Läufe): {count}. Sie laufen weiter, sofern nicht alles markiert ist.",
    confirmOne: "{count} Eintrag stoppen",
    confirmMany: "{count} Einträge stoppen",
    cancel: "Abbrechen",
    close: "Schließen",
    resultsIntro: "Ergebnis je Eintrag. Ein Signal garantiert nicht, dass der Prozess beendet wurde.",
    results: "Ergebnisse je Eintrag",
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
    noWork: "nur Hinweise des Anbieters",
    noticeOne: "{count} Hinweis des Anbieters",
    noticeMany: "{count} Hinweise des Anbieters",
    noticesAria: "Hinweise des Anbieters — Telemetrie, keine Arbeit",
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
    result: "Ergebnis",
    watched: "Überwachte Ausgabe",
    outputInFile: "Die Ausgabe ging in die Datei der Aufgabe (oben); der Anbieter schickt sie nicht in den Stream.",
    toolsAria: "Aufgerufene Werkzeuge",
    kind: {
      workflow: "Workflow",
      shell: "Hintergrundbefehl",
      monitor: "Monitor",
      agent: "Sub-Agent",
      message: "Hintergrund-Agent",
      notice: "Hinweis des Anbieters",
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
  },
  work: {
    kind: {
      plan: "Plan",
      task: "Aufgabe"
    },
    steps: "Schritt {done}/{total}",
    openPlan: "Plan {title} öffnen",
    openTask: "Aufgabe {title} öffnen",
    plans: {
      one: "{count} Plan",
      many: "{count} Pläne"
    },
    tasks: {
      one: "{count} Aufgabe",
      many: "{count} Aufgaben"
    },
    barAria: "In Arbeit: {summary}",
    barAriaCurrent: "In Arbeit: {summary} — aktuelle Aufgabe: {title}"
  }
} satisfies Translation<'chatA-activity'>
