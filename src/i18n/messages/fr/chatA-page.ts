import type { Translation } from '../../catalog.ts'

export default {
  session: "Session {id}",
  noSessionId: "Aucun identifiant de session fourni",
  back: "Retour",
  messagesOne: "{count} message",
  messagesMany: "{count} messages",
  noMessages: "Aucun message pour l’instant",
  scrollBottom: "Aller en bas"
} satisfies Translation<'chatA-page'>
