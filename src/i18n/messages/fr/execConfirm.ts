import type { Translation } from '../../catalog.ts'

export default {
  aria: 'Autoriser la tâche à s\'exécuter dans ce dossier',
  title: 'Exécuter dans ce dossier ?',
  hint: 'Rien ne démarre avant votre réponse. Vous seul pouvez l\'autoriser.',
  allow: 'Autoriser',
  reject: 'Refuser',
  state: {
    confirmed: 'Confirmé : la tâche démarre.',
    rejected: 'Refusé : rien n\'a été lancé.',
    expired: 'Expirée : relancez la délégation.',
  },
  error: {
    forbidden: 'Seul le propriétaire de cette demande peut y répondre.',
    conflict: 'Cette demande a déjà reçu une réponse ou ne correspond plus.',
    other: 'La réponse n\'a pas pu être envoyée',
  },
} satisfies Translation<'execConfirm'>
