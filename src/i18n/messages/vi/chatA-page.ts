import type { Translation } from '../../catalog.ts'

export default {
  session: "Phiên {id}",
  noSessionId: "Không có ID phiên",
  back: "Quay lại",
  messagesOne: "{count} tin nhắn",
  messagesMany: "{count} tin nhắn",
  noMessages: "Chưa có tin nhắn nào",
  scrollBottom: "Cuộn xuống cuối"
} satisfies Translation<'chatA-page'>
