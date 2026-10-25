import type { Translation } from '../../catalog.ts'

export default {
  aria: 'Der Aufgabe erlauben, in diesem Ordner zu laufen',
  title: 'In diesem Ordner ausführen?',
  hint: 'Nichts startet, bevor Sie antworten. Nur Sie können es erlauben.',
  allow: 'Erlauben',
  reject: 'Ablehnen',
  state: {
    confirmed: 'Bestätigt: Die Aufgabe startet.',
    rejected: 'Abgelehnt: Nichts wurde ausgeführt.',
    expired: 'Abgelaufen: Delegation erneut anfordern.',
  },
  error: {
    forbidden: 'Nur der Eigentümer dieser Anfrage kann sie beantworten.',
    conflict: 'Diese Anfrage wurde bereits beantwortet oder passt nicht mehr.',
    other: 'Die Antwort konnte nicht gesendet werden',
  },
} satisfies Translation<'execConfirm'>
