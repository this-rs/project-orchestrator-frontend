import type { Translation } from '../../catalog.ts'

export default {
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
    }
  },
  permission: {
    actions: "Diese Berechtigungsanfrage beantworten",
    allowOnce: "Einmal erlauben",
    allowSession: "Für diese Sitzung",
    deny: "Ablehnen",
    sessionHint: "In dieser Unterhaltung für genau diesen Aufruf nicht mehr gefragt",
    awaiting: "Warte auf die Bestätigung…",
    sessionCovers: "„Für diese Sitzung“ gilt nur für:",
    unconfirmed: "Keine Bestätigung erhalten. Bitte erneut antworten.",
    scopeRefused: "Diese Erlaubnis kann nicht für die Sitzung behalten werden (der Aufruf startet einen anderen Befehl, oder die Sitzung bietet es nicht an). Einmal erlauben oder ablehnen.",
    allowed: "Erlaubt",
    allowedSession: "Für die Sitzung erlaubt",
    denied: "Abgelehnt"
  }
} satisfies Translation<'chatA-tools'>
