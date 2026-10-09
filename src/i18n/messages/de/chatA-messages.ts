import type { Translation } from '../../catalog.ts'

export default {
  copy: {
    title: "Als Markdown kopieren",
    copied: "Kopiert!",
    popupTitle: "Nachricht als Markdown"
  },
  compact: {
    label: "Kontext komprimiert",
    trigger: {
      auto: "auto",
      manual: "manuell"
    },
    tokens: "~{count} K Tokens"
  },
  continued: {
    label: "Fortgesetzt",
    afterOne: "nach {count} Runde",
    afterMany: "nach {count} Runden"
  },
  bubble: {
    references: "Verweise",
    attachments: "Anhänge",
    copyMessage: "Nachricht als Markdown kopieren",
    copyReply: "Antwort als Markdown kopieren",
    thinking: "Denkt nach..."
  },
  list: {
    loading: "Nachrichten werden geladen...",
    loadingOlder: "Ältere Nachrichten werden geladen...",
    beginning: "— Anfang der Unterhaltung —",
    loadingNewer: "Neuere Nachrichten werden geladen...",
    scrollMore: "— Nach unten scrollen für mehr —",
    catchingUp: "Wird aufgeholt…",
    newActivity: "Neue Aktivität ↓"
  },
  compaction: {
    label: "Kontext wird komprimiert"
  },
  welcome: {
    title: "Project Orchestrator",
    subtitle: "Was möchtest du tun?",
    quickActions: "Schnellaktionen",
    selectProject: "Wähle oben ein Projekt aus, um Schnellaktionen zu nutzen",
    projectStatus: "Projektstatus",
    activePlanOne: "{count} aktiver Plan",
    activePlanMany: "{count} aktive Pläne",
    toReview: "{count} zu prüfen",
    allClear: "Alles erledigt",
    notesOne: "{count} Notiz",
    notesMany: "{count} Notizen",
    synced: "Synchronisiert {when}",
    untitled: "Ohne Titel",
    untitledConversation: "Unterhaltung ohne Titel",
    recent: "Letzte Unterhaltungen",
    actions: {
      next: {
        label: "Nächste Aufgabe",
        description: "Nächste verfügbare Aufgabe holen",
        prompt: "Was ist die nächste verfügbare Aufgabe im aktiven Plan? Zeig mir ihren Kontext und ihre Schritte."
      },
      plan: {
        label: "Etwas planen",
        description: "Eine Umsetzung planen",
        prompt: "Plane die Umsetzung von: "
      },
      impact: {
        label: "Auswirkungsanalyse",
        description: "Auswirkung einer Änderung analysieren",
        prompt: "Analysiere die Auswirkung der Änderung von: "
      },
      arch: {
        label: "Architektur",
        description: "Überblick über den Code",
        prompt: "Gib mir einen Überblick über die Projektarchitektur"
      },
      search: {
        label: "Codesuche",
        description: "Im Code suchen",
        prompt: "Durchsuche den Code nach: "
      },
      roadmap: {
        label: "Roadmap",
        description: "Meilensteine und Releases",
        prompt: "Zeig mir die vollständige Roadmap mit Meilensteinen und Releases"
      }
    },
    time: {
      now: "gerade eben",
      minutes: "vor {count} Min.",
      hours: "vor {count} Std.",
      days: "vor {count} T.",
      months: "vor {count} Mon."
    },
    plan: {
      draft: "Entwurf",
      approved: "Genehmigt",
      in_progress: "In Arbeit",
      completed: "Erledigt",
      cancelled: "Abgebrochen"
    }
  },
  panel: {
    connected: "Verbunden",
    reconnecting: "Verbindung wird wiederhergestellt…",
    disconnected: "Getrennt",
    connectionLost: "Verbindung verloren",
    exportTitle: "Chat-Export",
    newChatTitle: "Neuer Chat",
    chatTitle: "Chat",
    conversations: "Unterhaltungen",
    newConversation: "Neue Unterhaltung",
    backToChat: "Zurück zum Chat",
    sessions: "Sitzungen",
    newChat: "Neuer Chat",
    assistantTree: "Assistentenbaum",
    permissionSettings: "Berechtigungseinstellungen",
    copied: "Kopiert!",
    copyChat: "Chat als Markdown kopieren",
    exitFullscreen: "Vollbild beenden",
    close: "Schließen",
    backToParent: "Zurück zum Übergeordneten",
    actions: "Aktionen der Unterhaltung",
    attach: "Mit einem Plan oder einer Aufgabe verknüpfen…",
    hideTree: "Assistentenbaum ausblenden",
    showTree: "Assistentenbaum anzeigen",
    fullscreen: "Vollbild",
    noProjectsTitle: "Noch keine Projekte",
    noProjectsBody: "Füge diesem Workspace ein Projekt hinzu, um eine Unterhaltung mit Claude zu beginnen.",
    addProject: "Projekt hinzufügen"
  }
} satisfies Translation<'chatA-messages'>
