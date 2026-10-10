import type { Translation } from '../../catalog.ts'

export default {
  title: "Selecione um espaço de trabalho",
  lead: "Um espaço de trabalho agrupa os projetos que compartilham um contexto e objetivos. Escolha em qual trabalhar.",
  notFound: "O espaço de trabalho \"{slug}\" não foi encontrado",
  notFoundBody: "Ele pode ter sido excluído ou renomeado. Escolha outro abaixo.",
  loading: "Carregando espaços de trabalho",
  errorTitle: "Erro de conexão",
  errorBody: "Falha ao carregar os espaços de trabalho. O backend está em execução?",
  create: "Criar um espaço de trabalho",
  createSubmit: "Criar",
  creating: "Criando…",
  cancel: "Cancelar",
  nameLabel: "Nome do espaço de trabalho",
  namePlaceholder: "Meu espaço de trabalho",
  welcome: "Boas-vindas ao Project Orchestrator",
  welcomeLead: "Crie seu primeiro espaço de trabalho para começar.",
  createFirst: "Criar espaço de trabalho",
  createFailed: "Falha ao criar o espaço de trabalho",
  updated: "atualizado",
  explain: {
    what: "Um espaço de trabalho agrupa vários dos seus projetos que compartilham um contexto e objetivos.",
    why: "Você abre um espaço de trabalho e vê seus projetos, planos, notas e decisões juntos, e Hoje mostra o que espera por você em todos eles.",
    different: "Em vez de uma pasta por projeto sem nada entre elas, os projetos de um espaço de trabalho compartilham o que foi decidido, e um assistente que trabalha em um sabe o que os outros definiram.",
  },
} satisfies Translation<'workspaceSelector'>
