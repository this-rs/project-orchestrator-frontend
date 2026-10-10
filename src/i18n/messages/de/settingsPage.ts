import type { Translation } from '../../catalog.ts'

export default {
  back: "Zurück",
  settings: {
    title: "Einstellungen",
    description: "Einstellungen der Desktop-App. Sie gelten für jede Unterhaltung mit den Assistenten.",
    chatTitle: "Chat & KI",
    chatDescription: "Berechtigungsmodus, erlaubte und verweigerte Werkzeuge, Umgebungsvariablen und die von den Assistenten verwendete Claude-Code-CLI.",
    updatesTitle: "Updates",
    updatesDescription: "Prüfen Sie, ob eine neue Version der Desktop-App vorliegt, und installieren Sie sie.",
    providersNote: "Anbieter (Instanzen, Projektfreigabe, Rollen und Modellrichtlinie) haben eine eigene Seite:",
    providersLink: "Anbieter → /providers",
    explain: {
      what: "Die Einstellungen sind die Entscheidungen der Desktop-App selbst: wie Assistenten auf diesem Rechner handeln dürfen und wie sich die App aktualisiert.",
      why: "Sie legen einmal fest, was ein Assistent ausführen darf, welche Werkzeuge er nutzen darf und welche Version Sie verwenden.",
      different: "Heute sind diese Entscheidungen auf Konfigurationsdateien und Terminal-Flags verteilt. Hier sind sie ein Bildschirm, der für jede Unterhaltung gilt.",
    },
  },
  providers: {
    title: "Anbieter",
    description: "Wo Ihre Unterhaltungen laufen, was jedes Projekt dorthin senden darf und welches Modell was tut.",
    explain: {
      what: "Ihre Wahl der KI: Claude Code ist eingebaut, und Sie können einen weiteren Anbieter registrieren und ihn projektweise freigeben.",
      why: "Sie wählen Anbieter und Modell einer Unterhaltung, und ein Schlüssel wird nie in ein Formular getippt: Er bleibt im Tresor.",
      different: "Heute bedeutet ein Werkzeug ein Modell. Hier bleibt eine Unterhaltung bei ihrem Anbieter, und der Assistent, der eine Aufgabe delegiert, kann dafür Anbieter und Modell benennen.",
    },
  },
} satisfies Translation<'settingsPage'>
