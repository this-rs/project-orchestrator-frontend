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
    openAttachment: "Abrir {name}",
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
  spawn: {
    runner: "executor",
    conversation: "derivada",
    delegation: "delegada",
    pipeline: "pipeline",
    gate: "portão",
    trigger: "gatilho",
    mirrorClaudeCode: "subagente (Claude Code)",
    subagentOf: "Subagente de outra conversa"
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
      },
      prepare: {
        label: "Preparar algo",
        description: "Um evento, um arquivo, um lançamento",
        prompt: "Ajude-me a preparar o seguinte, como um plano de tarefas com o que depende do quê: "
      },
      track: {
        label: "Acompanhar algo",
        description: "Um orçamento, um cronograma, uma lista",
        prompt: "Configure uma forma de acompanhar o seguinte: um plano com suas tarefas, notas para o que eu disser e uma decisão a cada escolha. Aqui está o que acompanhar: "
      },
      resume: {
        label: "Retomar o que parou",
        description: "Retomar trabalho em espera",
        prompt: "O que parou ou está esperando por mim? Liste e depois retome o primeiro item."
      },
      decided: {
        label: "O que decidimos?",
        description: "Decisões e seus motivos",
        prompt: "O que decidimos até agora e por quê? Liste as decisões com seus motivos e as alternativas descartadas."
      },
      standing: {
        label: "Como estamos?",
        description: "Objetivos, planos, progresso",
        prompt: "Mostre-me como estamos: objetivos, planos, o que está feito e o que vem a seguir."
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
    mirrorBanner: "Espelho somente leitura de um subagente do Claude Code",
    actions: "Ações da conversa",
    attach: "Vincular a um plano ou tarefa…",
    hideTree: "Ocultar a árvore de assistentes",
    showTree: "Mostrar a árvore de assistentes",
    fullscreen: "Tela cheia",
    noProjectsTitle: "Nenhum projeto ainda",
    noProjectsBody: "Adicione um projeto a este workspace para iniciar uma conversa com o Claude.",
    addProject: "Adicionar um projeto"
  },
  attachment: {
    download: "Baixar",
    noPreview: "Este formato não pode ser exibido aqui — o arquivo ainda pode ser baixado.",
    noText: "Não foi possível extrair texto deste arquivo — ele ainda pode ser baixado.",
    loadFailed: "Não foi possível ler o arquivo.",
    truncated: "Prévia limitada aos primeiros {chars} caracteres — baixe o arquivo para ver o restante.",
  },
} satisfies Translation<'chatA-messages'>
