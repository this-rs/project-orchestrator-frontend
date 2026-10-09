import type { Translation } from '../../catalog.ts'

export default {
  session: "Сесія {id}",
  noSessionId: "Ідентифікатор сесії не вказано",
  back: "Назад",
  messagesOne: "Повідомлень: {count}",
  messagesMany: "Повідомлень: {count}",
  noMessages: "Повідомлень ще немає",
  scrollBottom: "Прокрутити вниз"
} satisfies Translation<'chatA-page'>
