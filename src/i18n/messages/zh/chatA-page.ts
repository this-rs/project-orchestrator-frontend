import type { Translation } from '../../catalog.ts'

export default {
  session: "会话 {id}",
  noSessionId: "未提供会话 ID",
  back: "返回",
  messagesOne: "{count} 条消息",
  messagesMany: "{count} 条消息",
  noMessages: "暂无消息",
  scrollBottom: "滚动到底部"
} satisfies Translation<'chatA-page'>
