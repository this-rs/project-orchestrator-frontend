import type { Translation } from '../../catalog.ts'

export default {
  session: "सेशन {id}",
  noSessionId: "कोई सेशन ID नहीं दिया गया",
  back: "वापस",
  messagesOne: "{count} संदेश",
  messagesMany: "{count} संदेश",
  noMessages: "अभी कोई संदेश नहीं",
  scrollBottom: "नीचे स्क्रॉल करें"
} satisfies Translation<'chatA-page'>
