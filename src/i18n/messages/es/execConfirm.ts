import type { Translation } from '../../catalog.ts'

export default {
  aria: 'Permitir que la tarea se ejecute en esta carpeta',
  title: '¿Ejecutar en esta carpeta?',
  hint: 'Nada empieza hasta que respondas. Solo tú puedes autorizarlo.',
  allow: 'Autorizar',
  reject: 'Rechazar',
  state: {
    confirmed: 'Confirmado: la tarea está empezando.',
    rejected: 'Rechazado: no se ejecutó nada.',
    expired: 'Caducada: vuelve a pedir la delegación.',
  },
  error: {
    forbidden: 'Solo el propietario de esta solicitud puede responderla.',
    conflict: 'Esta solicitud ya se respondió o ya no coincide.',
    other: 'No se pudo enviar la respuesta',
  },
} satisfies Translation<'execConfirm'>
