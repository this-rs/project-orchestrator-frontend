import type { Translation } from '../../catalog.ts'

export default {
  agent: {
    asked: "Dem Subagenten aufgetragen",
    kind: "Art des Agenten",
    answer: "Seine Antwort",
    failed: "Der Subagent ist gescheitert",
    open: "Die Unterhaltung des Subagenten öffnen",
    openTitle: "Die Unterhaltung öffnen, in der dieser Subagent gearbeitet hat",
    running: "Der Subagent arbeitet noch…",
    noChild: "Die untergeordnete Unterhaltung ist noch nicht aufgeführt",
    noChildTitle: "Die untergeordnete Unterhaltung wird über die Kennung dieses Werkzeugaufrufs gefunden. Sie erscheint, sobald der Server sie auflistet."
  },
  /** WebFetch / WebSearch: their result is data from the outside, never the assistant's text. */
  web: {
    externalSearch: "Suchergebnisse: externer Inhalt, nicht vom Assistenten geschrieben",
    externalPage: "Seiteninhalt: externer Inhalt, nicht vom Assistenten geschrieben",
  },
  bash: {
    emptyCommand: "(leerer Befehl)",
    showLess: "weniger anzeigen",
    showMore: "{count} weitere Zeichen anzeigen",
    noOutput: "keine Ausgabe",
    running: "läuft..."
  },
  default: {
    input: "Eingabe",
    error: "Fehler",
    result: "Ergebnis",
    truncated: "... (gekürzt)"
  },
  edit: {
    replaceAll: "alle ersetzen",
    removedLineOne: "-{count} Zeile",
    removedLineMany: "-{count} Zeilen",
    addedLineOne: "+{count} Zeile",
    addedLineMany: "+{count} Zeilen",
    moreRemovedOne: "... {count} weitere entfernte Zeile",
    moreRemovedMany: "... {count} weitere entfernte Zeilen",
    moreAddedOne: "... {count} weitere hinzugefügte Zeile",
    moreAddedMany: "... {count} weitere hinzugefügte Zeilen",
    truncated: "... (gekürzt)",
    editing: "wird bearbeitet..."
  },
  chat: {
    you: "Du",
    assistant: "Assistent",
    messageOne: "{count} Nachricht",
    messageMany: "{count} Nachrichten"
  },
  code: {
    copyPath: "Pfad kopieren",
    noResults: "Keine Ergebnisse",
    searchResults: "Suchergebnisse",
    noSymbols: "Keine Symbole gefunden",
    noReferences: "Keine Verweise gefunden",
    unknownFile: "(unbekannt)",
    references: "Verweise",
    calledBy: "Aufgerufen von",
    calls: "Ruft auf",
    noCallGraph: "Keine Aufrufgraph-Daten",
    callersColon: "Aufrufer:",
    dependentFiles: "Abhängige Dateien",
    mostConnected: "Am stärksten vernetzte Dateien",
    imports: "Importe",
    importedBy: "Importiert von",
    label: {
      results: "Ergebnisse",
      files: "Dateien",
      callers: "Aufrufer",
      callees: "Aufgerufene",
      imports: "Importe",
      dependents: "Abhängige"
    },
    cat: {
      functions: "Funktionen",
      structs: "Structs",
      enums: "Enums",
      traits: "Traits",
      impls: "Impls",
      macros: "Makros",
      constants: "Konstanten",
      type_aliases: "Typ-Aliase"
    },
    symbols: {
      implementations: "Implementierungen",
      traits: "Traits",
      impls: "Impl-Blöcke"
    },
    symbolsNone: {
      implementations: "Keine Implementierungen gefunden",
      traits: "Keine Traits gefunden",
      impls: "Keine Impl-Blöcke gefunden"
    }
  },
  entity: {
    project: "Projekt",
    created: "erstellt",
    plan: "Plan",
    path: "Pfad",
    synced: "synchronisiert",
    target: "Ziel",
    verify: "Prüfung",
    tasks: "Aufgaben",
    constraints: "Einschränkungen",
    criteria: "Akzeptanzkriterien",
    steps: "Schritte",
    decisions: "Entscheidungen",
    label: {
      tasks: "Aufgaben",
      constraints: "Einschränkungen",
      criteria: "Kriterien",
      steps: "Schritte",
      decisions: "Entscheidungen"
    },
    type: {
      plan: "Plan",
      task: "Aufgabe",
      project: "Projekt",
      milestone: "Meilenstein",
      workspace: "Workspace",
      note: "Notiz",
      release: "Release"
    },
    view: {
      entity: "{entity} ansehen",
      parentTask: "Übergeordnete Aufgabe ansehen",
      parentPlan: "Übergeordneten Plan ansehen",
      linkedTask: "Verknüpfte Aufgabe ansehen",
      linkedPlan: "Verknüpften Plan ansehen"
    },
    deleted: "Gelöscht",
    updated: "Aktualisiert",
    createdVerb: "Erstellt",
    moreFields: "+{count} weitere Felder"
  },
  list: {
    untitledPlan: "Plan ohne Titel",
    untitledSession: "Sitzung ohne Titel",
    msgOne: "{count} Nachr.",
    msgMany: "{count} Nachr.",
    energy: "Energieniveau",
    target: "Ziel: {date}",
    noResults: "Keine Ergebnisse",
    resultOne: "{count} Ergebnis",
    resultMany: "{count} Ergebnisse",
    matching: "passend zu „{query}“"
  },
  viz: {
    noRadar: "Keine Radardaten verfügbar.",
    unknownTarget: "unbekannt",
    direct: "Direkt ({count})",
    transitive: "Transitiv ({count})",
    total: "{count} insgesamt",
    importance: {
      critical: "KRITISCH",
      high: "HOCH",
      medium: "MITTEL",
      low: "NIEDRIG"
    },
    kind: {
      guideline: "Guideline",
      gotcha: "Stolperfalle",
      pattern: "Muster",
      context: "Kontext",
      tip: "Tipp",
      observation: "Beobachtung",
      assertion: "Behauptung",
      decision: "Entscheidung"
    },
    iso: {
      loading: "3D-Szene wird geladen…",
      composing: "3D-Szene wird verfasst…",
      refused: "Diese 3D-Szene wurde abgelehnt — zu korrigieren:",
      moreProblems: "… und {count} weitere",
      rebuild: "Neu aufbauen",
      notJson: "Diese 3D-Szene ist kein gültiges JSON ({detail}). Ihr Text:",
      notObject: "Diese 3D-Szene muss ein JSON-Objekt sein. Ihr Text:",
      tooLarge: "Diese 3D-Szene ist zu groß (höchstens {max} Zeichen). Ihr Text:"
    },
    mermaid: {
      title: "Diagramm",
      loading: "Diagramm wird geladen…",
      composing: "Diagramm wird geschrieben…",
      refused: "Dieses Diagramm wurde abgelehnt — Mermaid meldet:",
      empty: "Dieses Diagramm ist leer.",
      tooLarge: "Dieses Diagramm ist zu groß (höchstens {max} Zeichen). Sein Text:"
    },
    math: {
      composing: "Formel wird geschrieben…",
      refused: "Diese Formel wurde abgelehnt — KaTeX meldet:",
      empty: "Diese Formel ist leer.",
      tooLarge: "Diese Formel ist zu lang (höchstens {max} Zeichen). Ihr Text:"
    }
  },
  permission: {
    actions: "Diese Berechtigungsanfrage beantworten",
    allowOnce: "Einmal erlauben",
    allowSession: "Für diese Sitzung",
    deny: "Ablehnen",
    sessionHint: "In dieser Unterhaltung für genau diesen Aufruf nicht mehr gefragt",
    awaiting: "Warte auf die Bestätigung…",
    sessionCovers: "Falls gewährt, gilt „Für diese Sitzung“ nur für:",
    forbidden: "Nur die Person, der diese Unterhaltung gehört, kann antworten. Es wurde nichts beantwortet.",
    ownerUnreadable: "Wem diese Unterhaltung gehört, konnte nicht geprüft werden. Es wurde nichts beantwortet: bitte erneut versuchen.",
    unconfirmed: "Keine Bestätigung erhalten. Bitte erneut antworten.",
    scopeRefused: "Diese Erlaubnis kann nicht für die Sitzung behalten werden (der Aufruf startet einen anderen Befehl, oder die Sitzung bietet es nicht an). Einmal erlauben oder ablehnen.",
    allowed: "Erlaubt",
    allowedSession: "Für die Sitzung erlaubt",
    denied: "Abgelehnt",
    allowAlways: "Immer",
    alwaysHint: "Für genau diesen Aufruf nicht mehr gefragt, in Ihren Unterhaltungen zu diesem Projekt, die in seinem Verzeichnis laufen, auf diesem Rechner; erneut gefragt, wenn die Unterhaltung das Verzeichnis gewechselt hat",
    alwaysCovers: "Wenn erteilt, deckt „Immer“ nur ab:",
    destinationHint: 'Ein Netzwerkziel: Was die Freigabe umfasst, bestimmt der Orchestrator und nennt es, sobald Sie antworten',
    destinationCovers: 'Dieser Aufruf erreicht:',
    destinationAlwaysHint: 'Kann als Netzwerk-Einwilligung dieses Projekts gespeichert werden, aufgeführt und widerrufbar unter Einstellungen → Netzwerk-Tools',
    destinationAlwaysCovers: '„Immer“ kann als Netzwerk-Einwilligung dieses Projekts gespeichert werden (Einstellungen → Netzwerk-Tools).',
    originQuestion: "Netzwerkzugriff auf diesen Ursprung erlauben?",
    originScopes: "Was jede Antwort abdeckt",
    originOnce: "Einmal: nur dieser Aufruf. Nichts wird behalten.",
    originSession: "Für diese Sitzung: jede Seite dieses Ursprungs, bis die Sitzung endet. Nichts wird gespeichert.",
    originSessionHint: "Jede Seite dieses Ursprungs, für diese Sitzung",
    originAlways: "Immer: als Netzwerk-Einwilligung dieses Projekts gespeichert für:",
    originAlwaysRevocable: "Aufgelistet und widerrufbar unter Einstellungen → Netzwerk-Tools.",
    originAlwaysHint: "Als Netzwerk-Einwilligung dieses Projekts gespeichert, widerrufbar unter Einstellungen → Netzwerk-Tools",
    alwaysRefused: "Dieser Aufruf kann nicht dauerhaft erlaubt werden (nur ein exakter Lesezugriff oder ein schreibgeschützter Befehl ohne Umleitung oder Verkettung). Antworten Sie einmalig oder für die Sitzung.",
    allowedAlways: "Immer erlaubt"
  },
  lastingRules: {
    title: "Immer erlaubte Aufrufe",
    description: "Aufrufe, die Sie dauerhaft erlaubt haben, pro Projekt. Jeder deckt nur genau diesen Aufruf ab, in Unterhaltungen, die im Projektverzeichnis auf diesem Rechner laufen. Widerrufen, wird er ab der nächsten Anfrage auf diesem Rechner wieder gefragt.",
    empty: "Kein Aufruf ist dauerhaft erlaubt.",
    disabled: "Dieser Server speichert keine dauerhaften Freigaben.",
    revoke: "Widerrufen",
    revoked: "Widerrufen: ab der nächsten Anfrage auf diesem Rechner wieder gefragt.",
    loadFailed: "Ihre dauerhaften Freigaben konnten nicht geladen werden.",
    revokeFailed: "Konnte nicht widerrufen werden. Erneut versuchen.",
    notHeld: "Gilt nicht mehr",
    engineNative: "nativer Motor",
    engineClaudeCode: "Claude Code",
    sandboxDisabled: "außerhalb der Sandbox"
  }
} satisfies Translation<'chatA-tools'>
