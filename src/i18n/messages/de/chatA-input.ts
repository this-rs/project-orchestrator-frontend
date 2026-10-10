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
  }
} satisfies Translation<'chatA-input'>
