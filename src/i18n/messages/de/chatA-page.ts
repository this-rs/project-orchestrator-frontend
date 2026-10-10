import type { Translation } from '../../catalog.ts'

export default {
  session: "Sitzung {id}",
  noSessionId: "Keine Sitzungs-ID angegeben",
  back: "Zurück",
  messagesOne: "{count} Nachricht",
  messagesMany: "{count} Nachrichten",
  noMessages: "Noch keine Nachrichten",
  scrollBottom: "Nach unten scrollen"
} satisfies Translation<'chatA-page'>
