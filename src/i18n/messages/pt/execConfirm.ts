import type { Translation } from '../../catalog.ts'

export default {
  aria: 'Permitir que a tarefa execute nesta pasta',
  title: 'Executar nesta pasta?',
  hint: 'Nada começa antes da sua resposta. Só você pode autorizar.',
  allow: 'Autorizar',
  reject: 'Recusar',
  state: {
    confirmed: 'Confirmado: a tarefa está a começar.',
    rejected: 'Recusado: nada foi executado.',
    expired: 'Expirada: peça a delegação novamente.',
  },
  error: {
    forbidden: 'Só o proprietário deste pedido pode responder.',
    conflict: 'Este pedido já foi respondido ou já não corresponde.',
    other: 'Não foi possível enviar a resposta',
  },
} satisfies Translation<'execConfirm'>
