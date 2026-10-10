import type { Translation } from '../../catalog.ts'

export default {
  description: 'Implementierungsphasen planen und verfolgen',
  newPlan: 'Neuer Plan',
  searchPlaceholder: 'Pläne suchen…',
  allStatuses: 'Alle Status',
  project: 'Projekt',
  listLabel: 'Pläne',
  selectPlan: '{title} auswählen',
  createdBy: 'Erstellt von {name}',
  loaded: '{loaded} von {total} geladen',
  count: {
    one: '{count} Plan',
    other: '{count} Pläne',
  },
  empty: {
    pristineTitle: 'Noch keine Pläne',
    pristineBody: 'Erstellen Sie einen Plan, um Ihre Entwicklungsarbeit zu organisieren.',
    filteredTitle: 'Keine passenden Pläne',
    filteredBody: 'Passen Sie Ihre Suche oder die Filter an.',
  },
  toast: {
    created: 'Plan erstellt',
    updated: 'Plan aktualisiert',
    deleted: 'Plan gelöscht',
    deletedMany: {
      one: '{count} Plan gelöscht',
      other: '{count} Pläne gelöscht',
    },
  },
  dialog: {
    create: 'Plan erstellen',
    edit: 'Plan bearbeiten',
  },
  confirm: {
    deleteTitle: 'Plan löschen?',
    deleteBody: 'Dieser Plan und alle seine Aufgaben werden endgültig gelöscht.',
    bulkTitle: {
      one: '{count} Plan löschen?',
      other: '{count} Pläne löschen?',
    },
    bulkBody: {
      one: '{count} Plan und alle seine Aufgaben werden endgültig gelöscht.',
      other: '{count} Pläne und alle ihre Aufgaben werden endgültig gelöscht.',
    },
  },
} satisfies Translation<'plans'>
