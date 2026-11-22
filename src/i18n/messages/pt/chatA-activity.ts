import type { Translation } from '../../catalog.ts'

export default {
  kindName: {
    run: "execução",
    workflow: "workflow",
    agent: "agente",
    shell: "shell",
    monitor: "monitor"
  },
  kindCount: {
    run: {
      one: "{count} execução",
      many: "{count} execuções"
    },
    workflow: {
      one: "{count} workflow",
      many: "{count} workflows"
    },
    agent: {
      one: "{count} agente",
      many: "{count} agentes"
    },
    shell: {
      one: "{count} shell",
      many: "{count} shells"
    },
    monitor: {
      one: "{count} monitor",
      many: "{count} monitores"
    }
  },
  row: {
    progress: "{settled}/{total} agentes",
    stopping: "parando…",
    stoppingTitle: "Parando…",
    stop: "Parar",
    stopAria: "Parar {title}",
    stopRun: "Parar esta execução",
    show: "Mostrar na conversa",
    showAria: "Mostrar {title} na conversa",
    openConversation: "Abrir a conversa",
    openConversationAria: "Abrir a conversa de {title}",
    dashboard: "Abrir o painel do runner",
    dashboardAria: "Abrir o painel do runner de {title}"
  },
  bar: {
    acknowledge: "Verifiquei esta tarefa — permitir outra solicitação",
    runningAria: "Em execução: {summary}",
    stoppedOne: "Sinal aceite para {count} processo. Pode ainda estar em execução.",
    stoppedMany: "Sinal aceite para {count} processos. Podem ainda estar em execução.",
    noPid: "Não foi confirmado nenhum sinal para esta tarefa. O resultado é desconhecido; verifique a sua atividade."
  },
  cancelAll: {
    open: "Parar as ferramentas da sessão, incluindo as dos subagentes",
    explain: "Isto envia um sinal de interrupção a todos os processos de ferramentas desta sessão, enquanto o turno continua. Os processos podem ignorar o sinal ou sobreviver. Verifique o estado real depois. Os processos de ferramentas dos subagentes também podem ser afetados quando são descendentes; alguns podem sobreviver.",
    confirm: "Enviar interrupção às ferramentas da sessão e dos subagentes",
    back: "Voltar",
    sending: "Enviando interrupção…",
    signalled: "Foi recebida resposta de um proprietário. Um sinal não garante a paragem dos processos; outras operações podem continuar em curso. Verifique a atividade da sessão.",
    capped: "Um proprietário comunicou um limite de frequência. Outros ainda podem agir; verifique a sessão antes de tentar novamente.",
    uncertain: "Resultado desconhecido. O sinal ainda pode ser enviado; verifique a sessão antes de tentar novamente.",
    refused: "Foi recebida uma recusa de um motor.",
    unsupported: "Este fornecedor não consegue parar todas as ferramentas desta sessão.",
    ownerUnreachable: "Proprietário inacessível; nenhuma paragem foi confirmada. Verifique a atividade da sessão.",
    identityChanged: "Nenhum pedido foi enviado: não foi possível verificar a identidade autenticada. Verifique a sessão e inicie sessão novamente se necessário.",
    reset: "Verifiquei esta sessão — permitir outro pedido",
  },
  cancel: {
    unsupportedNotice: "Foi recebida uma recusa; a paragem não está confirmada. Verifique a atividade da sessão.",
    unknownNotice: "O resultado deste pedido de paragem é desconhecido. Verifique a atividade da sessão.",
    retryNotice: "O resultado não está confirmado. Verifique a atividade antes de tentar novamente parar esta tarefa.",
    timeoutNotice: "A parada não teve resposta a tempo — ela ainda pode acontecer.",
    taskRefusedNotice: "Foi recebida uma recusa; a paragem não está confirmada. Verifique a atividade da sessão.",
    unauthenticatedNotice: 'Autenticação recusada (401): o seu início de sessão está em falta ou expirou. Nenhuma paragem foi confirmada; inicie sessão novamente e verifique a atividade da sessão.',
    forbiddenNotice: 'Autorização recusada (403): esta conta não tem permissão para parar estas ferramentas. Nenhuma paragem foi confirmada; verifique a atividade da sessão.',
  },
  stopDialog: {
    title: "Parar as ferramentas desta sessão",
    description: "Nada é enviado até você confirmar. Desmarque o que deve continuar.",
    empty: "Nenhuma atividade individual listada. Confirmar para todas as ferramentas da sessão, inclusive as em primeiro plano.",
    selected: "{selected} de {total} selecionados",
    quick: {
      label: "Seleções rápidas",
      all: "Tudo",
      none: "Nada",
      onlyOld: "Só as antigas",
      onlyOldHint: "Desmarca o que começou há menos de {minutes} minutos",
      keepBackground: "Manter as tarefas em segundo plano",
      keepMonitors: "Manter os monitores",
      keepAgents: "Manter os subagentes",
    },
    group: { agent: "Subagentes", background: "Tarefas em segundo plano", monitor: "Monitores", other: "Outros" },
    age: { unknown: "idade desconhecida", lessThanMinute: "há menos de 1 min", minutes: "há {count} min", hours: "há {count} h" },
    alreadyRequested: "Já foi pedida a parada desta tarefa.",
    foregroundWarning: "As ferramentas em primeiro plano não são paradas: não têm identificador próprio. Só «Tudo» as para.",
    untargetableWarning: "Itens marcados que não podem ser parados um a um (subagentes, execuções): {count}. Continuam a menos que tudo esteja marcado.",
    confirmOne: "Parar {count} item",
    confirmMany: "Parar {count} itens",
    cancel: "Cancelar",
    close: "Fechar",
    resultsIntro: "Resultado de cada item. Um sinal não garante que o processo parou.",
    results: "Resultados por item",
  },
  agent: {
    subAgent: "Subagente",
    toolOne: "{count} ferramenta",
    toolMany: "{count} ferramentas",
    running: "{count} em execução",
    runningIndicator: "Agente em execução..."
  },
  status: {
    spawning: "iniciando",
    running: "em execução",
    verifying: "verificando",
    completed: "concluído",
    failed: "com falha",
    interrupted: "interrompido"
  },
  banner: {
    elapsed: "Decorrido",
    cost: "Custo",
    ram: "RAM (residente)",
    cpu: "CPU",
    pidTitle: "PID {pid} · {threads} threads · {status}",
    viewAgent: "Ver a conversa deste agente",
    view: "Ver",
    interrupt: "Interromper este agente",
    runTitle: "Execução {id}",
    runShort: "exec. {id}",
    wave: "Onda {wave}",
    openDashboard: "Abrir o painel completo do runner",
    dashboard: "Painel",
    spawning: "Iniciando agentes…",
    noAgents: "Nenhum agente ativo",
    title: "Modo agêntico",
    activeOne: "{count} execução ativa",
    activeMany: "{count} execuções ativas",
    cumulative: "acumulado {cost}"
  },
  pill: {
    title: "Modo agêntico",
    state: {
      idle: "inativo",
      ready: "pronto",
      running: "em execução",
      completed: "concluído"
    },
    workingOne: "Modo agêntico — {count} agente trabalhando",
    workingMany: "Modo agêntico — {count} agentes trabalhando",
    completedOne: "Modo agêntico — {count} execução concluída",
    completedMany: "Modo agêntico — {count} execuções concluídas",
    ready: "Modo agêntico — pronto",
    streamingOne: "{count} execução em streaming agora. O banner abaixo mostra os agentes em tempo real.",
    streamingMany: "{count} execuções em streaming agora. O banner abaixo mostra os agentes em tempo real.",
    more: "+ {count} a mais",
    readyNote: "Há planos vinculados a este chat, mas nenhum está em streaming agora.",
    ranOne: "{count} execução iniciada a partir deste chat. Nenhuma está em streaming agora.",
    ranMany: "{count} execuções iniciadas a partir deste chat. Nenhuma está em streaming agora.",
    openDashboard: "Abrir o painel do runner"
  },
  bg: {
    title: "Atividade em segundo plano",
    listAria: "Atividades em segundo plano",
    noWork: "apenas avisos do fornecedor",
    noticeOne: "{count} aviso do fornecedor",
    noticeMany: "{count} avisos do fornecedor",
    noticesAria: "Avisos do fornecedor — telemetria, nenhum trabalho",
    summary: {
      running: "{count} em execução",
      queued: "{count} na fila",
      failed: "{count} com falha",
      done: "{count} concluídas",
      cancelled: "{count} canceladas",
      ended: "{count} encerradas"
    }
  },
  card: {
    showMore: "Mostrar mais",
    showLess: "Mostrar menos",
    lineOne: "{count} linha",
    lineMany: "{count} linhas",
    earlierLineOne: "Mostrar {count} linha anterior",
    earlierLineMany: "Mostrar {count} linhas anteriores",
    progressOf: "Progresso de {title}",
    agents: "{settled}/{total} agentes",
    agentsOf: "Agentes de {title}",
    tokens: "{count} tokens",
    toolUseOne: "{count} uso de ferramenta",
    toolUseMany: "{count} usos de ferramenta",
    timeline: "Linha do tempo",
    eventOne: "{count} evento",
    eventMany: "{count} eventos",
    eventsOf: "Eventos de {title}",
    hiddenEventOne: "… {count} evento anterior não mantido",
    hiddenEventMany: "… {count} eventos anteriores não mantidos",
    rawPayload: "Dados brutos",
    parameters: "Parâmetros",
    latestOutput: "Última saída",
    output: "Saída",
    result: "Resultado",
    watched: "Saída observada",
    outputInFile: "A saída foi para o arquivo da tarefa (acima); o fornecedor não a envia ao fluxo.",
    toolsAria: "Ferramentas usadas",
    kind: {
      workflow: "Workflow",
      shell: "Comando em segundo plano",
      monitor: "Monitor",
      agent: "Subagente",
      message: "Agente em segundo plano",
      notice: "Aviso do fornecedor",
      generic: "Atividade em segundo plano"
    },
    status: {
      running: "Em execução",
      queued: "Na fila",
      done: "Concluída",
      failed: "Com falha",
      cancelled: "Cancelada",
      ended: "Encerrada"
    }
  },
  runs: {
    finished: "Concluída",
    view: "Ver execução",
    stop: "Parar execução",
    loading: "Carregando execuções…",
    noDetails: "Nenhum detalhe de execução disponível.",
    inProgressOne: "{count} execução em andamento",
    inProgressMany: "{count} execuções em andamento",
    completedOne: "{count} execução concluída",
    completedMany: "{count} execuções concluídas",
    done: "{count} concluídas"
  },
  work: {
    kind: {
      plan: "plano",
      task: "tarefa"
    },
    steps: "etapa {done}/{total}",
    openPlan: "Abrir o plano {title}",
    openTask: "Abrir a tarefa {title}",
    plans: {
      one: "{count} plano",
      many: "{count} planos"
    },
    tasks: {
      one: "{count} tarefa",
      many: "{count} tarefas"
    },
    barAria: "Em andamento: {summary}",
    barAriaCurrent: "Em andamento: {summary} — tarefa atual: {title}"
  }
} satisfies Translation<'chatA-activity'>
