import type { Translation } from '../../catalog.ts'

export default {
  copy: {
    title: "Copiar como markdown",
    copied: "Copiado!",
    popupTitle: "Markdown da mensagem"
  },
  compact: {
    label: "Contexto compactado",
    trigger: {
      auto: "auto",
      manual: "manual"
    },
    tokens: "~{count} K tokens"
  },
  continued: {
    label: "Continuado",
    afterOne: "após {count} turno",
    afterMany: "após {count} turnos"
  },
  bubble: {
    references: "Referências",
    attachments: "Anexos",
    copyMessage: "Copiar a mensagem como markdown",
    copyReply: "Copiar a resposta como markdown",
    thinking: "Pensando..."
  },
  list: {
    loading: "Carregando mensagens...",
    loadingOlder: "Carregando mensagens anteriores...",
    beginning: "— Início da conversa —",
    loadingNewer: "Carregando mensagens mais recentes...",
    scrollMore: "— Role para baixo para ver mais —",
    catchingUp: "Atualizando…",
    newActivity: "Nova atividade ↓"
  },
  compaction: {
    label: "Compactando o contexto"
  },
  welcome: {
    title: "Project Orchestrator",
    subtitle: "O que você gostaria de fazer?",
    quickActions: "Ações rápidas",
    selectProject: "Selecione um projeto acima para usar as ações rápidas",
    projectStatus: "Status do projeto",
    activePlanOne: "{count} plano ativo",
    activePlanMany: "{count} planos ativos",
    toReview: "{count} para revisar",
    allClear: "Tudo em dia",
    notesOne: "{count} nota",
    notesMany: "{count} notas",
    synced: "Sincronizado {when}",
    untitled: "Sem título",
    untitledConversation: "Conversa sem título",
    recent: "Conversas recentes",
    actions: {
      next: {
        label: "Próxima tarefa",
        description: "Obter a próxima tarefa disponível",
        prompt: "Qual é a próxima tarefa disponível no plano ativo? Mostre-me o contexto e as etapas."
      },
      plan: {
        label: "Planejar algo",
        description: "Planejar uma implementação",
        prompt: "Planeje a implementação de: "
      },
      impact: {
        label: "Análise de impacto",
        description: "Analisar o impacto de uma mudança",
        prompt: "Analise o impacto de alterar: "
      },
      arch: {
        label: "Arquitetura",
        description: "Visão geral do código",
        prompt: "Dê-me uma visão geral da arquitetura do projeto"
      },
      search: {
        label: "Busca no código",
        description: "Pesquisar no código",
        prompt: "Pesquise no código por: "
      },
      roadmap: {
        label: "Roadmap",
        description: "Marcos e releases",
        prompt: "Mostre-me o roadmap completo com marcos e releases"
      }
    },
    time: {
      now: "agora mesmo",
      minutes: "há {count} min",
      hours: "há {count} h",
      days: "há {count} d",
      months: "há {count} meses"
    },
    plan: {
      draft: "Rascunho",
      approved: "Aprovado",
      in_progress: "Em andamento",
      completed: "Concluído",
      cancelled: "Cancelado"
    }
  },
  panel: {
    connected: "Conectado",
    reconnecting: "Reconectando…",
    disconnected: "Desconectado",
    connectionLost: "Conexão perdida",
    exportTitle: "Exportação do chat",
    newChatTitle: "Novo chat",
    chatTitle: "Chat",
    conversations: "Conversas",
    newConversation: "Nova conversa",
    backToChat: "Voltar ao chat",
    sessions: "Sessões",
    newChat: "Novo chat",
    assistantTree: "Árvore de assistentes",
    permissionSettings: "Configurações de permissão",
    copied: "Copiado!",
    copyChat: "Copiar o chat como markdown",
    exitFullscreen: "Sair da tela cheia",
    close: "Fechar",
    backToParent: "Voltar ao pai",
    actions: "Ações da conversa",
    attach: "Vincular a um plano ou tarefa…",
    hideTree: "Ocultar a árvore de assistentes",
    showTree: "Mostrar a árvore de assistentes",
    fullscreen: "Tela cheia",
    noProjectsTitle: "Nenhum projeto ainda",
    noProjectsBody: "Adicione um projeto a este workspace para iniciar uma conversa com o Claude.",
    addProject: "Adicionar um projeto"
  }
} satisfies Translation<'chatA-messages'>
