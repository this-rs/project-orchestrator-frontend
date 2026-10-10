import type { Translation } from '../../catalog.ts'

export default {
  session: "Sesión {id}",
  noSessionId: "No se proporcionó ningún ID de sesión",
  back: "Atrás",
  messagesOne: "{count} mensaje",
  messagesMany: "{count} mensajes",
  noMessages: "Aún no hay mensajes",
  scrollBottom: "Ir al final"
} satisfies Translation<'chatA-page'>
