import type { Translation } from '../../catalog.ts'

export default {
  session: "セッション {id}",
  noSessionId: "セッション ID が指定されていません",
  back: "戻る",
  messagesOne: "{count} 件のメッセージ",
  messagesMany: "{count} 件のメッセージ",
  noMessages: "メッセージはまだありません",
  scrollBottom: "一番下へスクロール"
} satisfies Translation<'chatA-page'>
