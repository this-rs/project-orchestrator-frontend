import type { Translation } from '../../catalog.ts'

export default {
  session: "세션 {id}",
  noSessionId: "세션 ID가 제공되지 않았습니다",
  back: "뒤로",
  messagesOne: "메시지 {count}개",
  messagesMany: "메시지 {count}개",
  noMessages: "아직 메시지가 없습니다",
  scrollBottom: "맨 아래로 스크롤"
} satisfies Translation<'chatA-page'>
