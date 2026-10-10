import type { Translation } from '../../catalog.ts'

export default {
  title: "Arbeitsbereich auswählen",
  lead: "Ein Arbeitsbereich fasst Projekte zusammen, die einen Kontext und Ziele teilen. Wählen Sie, in welchem Sie arbeiten möchten.",
  notFound: "Arbeitsbereich „{slug}“ wurde nicht gefunden",
  notFoundBody: "Er wurde möglicherweise gelöscht oder umbenannt. Wählen Sie unten einen anderen.",
  loading: "Arbeitsbereiche werden geladen",
  errorTitle: "Verbindungsfehler",
  errorBody: "Arbeitsbereiche konnten nicht geladen werden. Läuft das Backend?",
  create: "Arbeitsbereich erstellen",
  createSubmit: "Erstellen",
  creating: "Wird erstellt…",
  cancel: "Abbrechen",
  nameLabel: "Name des Arbeitsbereichs",
  namePlaceholder: "Mein Arbeitsbereich",
  welcome: "Willkommen bei Project Orchestrator",
  welcomeLead: "Erstellen Sie Ihren ersten Arbeitsbereich, um loszulegen.",
  createFirst: "Arbeitsbereich erstellen",
  createFailed: "Arbeitsbereich konnte nicht erstellt werden",
  updated: "aktualisiert",
  explain: {
    what: "Ein Arbeitsbereich fasst mehrere Ihrer Projekte zusammen, die Kontext und Ziele teilen.",
    why: "Sie öffnen einen Arbeitsbereich und sehen seine Projekte, Pläne, Notizen und Entscheidungen zusammen; Heute zeigt, was in allen auf Sie wartet.",
    different: "Statt eines Ordners pro Projekt ohne Verbindung teilen die Projekte eines Arbeitsbereichs, was entschieden wurde; ein Assistent, der an einem arbeitet, weiß, was die anderen geklärt haben.",
  },
} satisfies Translation<'workspaceSelector'>
