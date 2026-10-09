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
    tooFast: "Cancelamentos rápidos demais — tente novamente em instantes.",
    cancelFailed: "Falha ao cancelar a tarefa — use o Parar global.",
    runningAria: "Em execução: {summary}",
    stoppedOne: "{count} subprocesso interrompido.",
    stoppedMany: "{count} subprocessos interrompidos.",
    noPid: "Cancelamento registrado, mas o PID do subprocesso era desconhecido — se os sinais continuarem chegando, use o botão Parar global."
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
    kind: {
      workflow: "Workflow",
      shell: "Comando em segundo plano",
      monitor: "Monitor",
      agent: "Subagente",
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
  }
} satisfies Translation<'chatA-activity'>
