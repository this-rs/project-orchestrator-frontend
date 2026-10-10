import type { Translation } from '../../catalog.ts'

export default {
  ask: {
    answered: "Beantwortet:",
    placeholder: "Oder gib deine Antwort ein...",
    submit: "Senden",
    notSent: "Nicht gesendet: Verbindung verloren. Deine Antwort bleibt erhalten, versuche es nach dem Wiederverbinden erneut."
  },
  attachments: {
    processing: "Wird verarbeitet…",
    remove: "Entfernen",
    removeAria: "{name} entfernen",
    pendingSend: "Die Nachricht wird gesendet, sobald der Upload abgeschlossen ist"
  },
  upload: {
    network: "Netzwerkfehler — die Datei hat den Server nie erreicht",
    timeout: "Der Server hat nicht rechtzeitig geantwortet — entferne die Datei und füge sie erneut hinzu",
    tooLarge: "Datei zu groß",
    unsupported: "Nicht unterstütztes Dateiformat",
    unreadable: "Die Datei konnte nicht gelesen werden (fehlerhaft oder beschädigt)",
    forbidden: "Upload hier nicht erlaubt",
    failed: "Upload fehlgeschlagen (HTTP {status})"
  },
  action: {
    send: "Nachricht senden",
    stop: "Generierung stoppen",
    stopping: "Wird beendet…",
    waiting: "Warten, bis die Anhänge hochgeladen sind",
    idle: "Nachricht senden",
    removeFailed: "Entferne zuerst den fehlgeschlagenen Anhang",
    waitingUpload: "Warten, bis der Upload abgeschlossen ist"
  },
  composer: {
    imageName: "Bild",
    alreadyIn: "{label} ist bereits in der Nachricht.",
    added: "{label} zur Nachricht hinzugefügt.",
    close: "Schließen",
    maxRefs: "Höchstens {max} Verweise pro Nachricht: der letzte wurde nicht hinzugefügt.",
    references: "Verweise",
    placeholder: "Nachricht senden...",
    attach: "Datei anhängen",
    override: "(überschrieben)",
    default: "Standard",
    auto: "Auto",
    autoOn: "Automatisches Fortfahren aktiviert",
    autoOff: "Automatisches Fortfahren deaktiviert",
    drop: "Zum Anhängen ablegen"
  },
  refs: {
    picker: {
      all: "Alle",
      filterByKind: "Nach Art filtern",
      hintActors: "Akteure",
      hintSearch: "suchen",
      kindOnly: "Nur {kind}",
      resultsOne: "{count} Ergebnis",
      resultsMany: "{count} Ergebnisse",
      noResults: "Keine Ergebnisse",
      searching: "Suche…",
      noActors: "Keine Akteure auf diesem Server verfügbar",
      needsProject: "Wähle ein Projekt, um Personas und Skills zu suchen",
      close: "Verweise schließen"
    }
  }
} satisfies Translation<'chatA-input'>
