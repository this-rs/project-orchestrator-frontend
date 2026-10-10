import type { Translation } from '../../catalog.ts'

export default {
  session: "Сессия {id}",
  noSessionId: "Идентификатор сессии не указан",
  back: "Назад",
  messagesOne: "Сообщений: {count}",
  messagesMany: "Сообщений: {count}",
  noMessages: "Сообщений пока нет",
  scrollBottom: "Прокрутить вниз"
} satisfies Translation<'chatA-page'>
