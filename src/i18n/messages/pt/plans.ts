import type { Translation } from '../../catalog.ts'

export default {
  description: 'Planeje e acompanhe as fases de implementação',
  newPlan: 'Novo plano',
  searchPlaceholder: 'Buscar planos…',
  allStatuses: 'Todos os status',
  project: 'Projeto',
  listLabel: 'Planos',
  selectPlan: 'Selecionar {title}',
  createdBy: 'Criado por {name}',
  loaded: '{loaded} de {total} carregados',
  count: {
    one: '{count} plano',
    other: '{count} planos',
  },
  empty: {
    pristineTitle: 'Nenhum plano ainda',
    pristineBody: 'Crie um plano para organizar seu trabalho de desenvolvimento.',
    filteredTitle: 'Nenhum plano correspondente',
    filteredBody: 'Tente ajustar a busca ou os filtros.',
  },
  toast: {
    created: 'Plano criado',
    updated: 'Plano atualizado',
    deleted: 'Plano excluído',
    deletedMany: {
      one: '{count} plano excluído',
      other: '{count} planos excluídos',
    },
  },
  dialog: {
    create: 'Criar plano',
    edit: 'Editar plano',
  },
  confirm: {
    deleteTitle: 'Excluir o plano?',
    deleteBody: 'Este plano e todas as suas tarefas serão excluídos permanentemente.',
    bulkTitle: {
      one: 'Excluir {count} plano?',
      other: 'Excluir {count} planos?',
    },
    bulkBody: {
      one: '{count} plano e todas as suas tarefas serão excluídos permanentemente.',
      other: '{count} planos e todas as suas tarefas serão excluídos permanentemente.',
    },
  },
} satisfies Translation<'plans'>
