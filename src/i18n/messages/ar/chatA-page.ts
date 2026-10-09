import type { Translation } from '../../catalog.ts'

export default {
  session: "الجلسة {id}",
  noSessionId: "لم يتم تحديد معرّف الجلسة",
  back: "رجوع",
  messagesOne: "{count} رسالة",
  messagesMany: "{count} رسائل",
  noMessages: "لا توجد رسائل بعد",
  scrollBottom: "التمرير إلى الأسفل"
} satisfies Translation<'chatA-page'>
