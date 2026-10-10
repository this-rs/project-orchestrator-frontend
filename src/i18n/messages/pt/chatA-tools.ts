import type { Translation } from '../../catalog.ts'

export default {
  bash: {
    emptyCommand: "(comando vazio)",
    showLess: "mostrar menos",
    showMore: "mostrar mais {count} caracteres",
    noOutput: "sem saída",
    running: "em execução..."
  },
  default: {
    input: "Entrada",
    error: "Erro",
    result: "Resultado",
    truncated: "... (truncado)"
  },
  edit: {
    replaceAll: "substituir tudo",
    removedLineOne: "-{count} linha",
    removedLineMany: "-{count} linhas",
    addedLineOne: "+{count} linha",
    addedLineMany: "+{count} linhas",
    moreRemovedOne: "... mais {count} linha removida",
    moreRemovedMany: "... mais {count} linhas removidas",
    moreAddedOne: "... mais {count} linha adicionada",
    moreAddedMany: "... mais {count} linhas adicionadas",
    truncated: "... (truncado)",
    editing: "editando..."
  },
  chat: {
    you: "Você",
    assistant: "Assistente",
    messageOne: "{count} mensagem",
    messageMany: "{count} mensagens"
  },
  code: {
    copyPath: "Copiar caminho",
    noResults: "Sem resultados",
    searchResults: "Resultados da busca",
    noSymbols: "Nenhum símbolo encontrado",
    noReferences: "Nenhuma referência encontrada",
    unknownFile: "(desconhecido)",
    references: "Referências",
    calledBy: "Chamada por",
    calls: "Chama",
    noCallGraph: "Sem dados do grafo de chamadas",
    callersColon: "chamadores:",
    dependentFiles: "Arquivos dependentes",
    mostConnected: "Arquivos mais conectados",
    imports: "Importações",
    importedBy: "Importado por",
    label: {
      results: "resultados",
      files: "arquivos",
      callers: "chamadores",
      callees: "chamados",
      imports: "importações",
      dependents: "dependentes"
    },
    cat: {
      functions: "funções",
      structs: "structs",
      enums: "enums",
      traits: "traits",
      impls: "impls",
      macros: "macros",
      constants: "constantes",
      type_aliases: "aliases de tipo"
    },
    symbols: {
      implementations: "Implementações",
      traits: "Traits",
      impls: "Blocos impl"
    },
    symbolsNone: {
      implementations: "Nenhuma implementação encontrada",
      traits: "Nenhum trait encontrado",
      impls: "Nenhum bloco impl encontrado"
    }
  },
  entity: {
    project: "projeto",
    created: "criado",
    plan: "plano",
    path: "caminho",
    synced: "sincronizado",
    target: "alvo",
    verify: "verificação",
    tasks: "Tarefas",
    constraints: "Restrições",
    criteria: "Critérios de aceitação",
    steps: "Etapas",
    decisions: "Decisões",
    label: {
      tasks: "tarefas",
      constraints: "restrições",
      criteria: "critérios",
      steps: "etapas",
      decisions: "decisões"
    },
    type: {
      plan: "plano",
      task: "tarefa",
      project: "projeto",
      milestone: "marco",
      workspace: "workspace",
      note: "nota",
      release: "release"
    },
    view: {
      entity: "Ver {entity}",
      parentTask: "Ver a tarefa pai",
      parentPlan: "Ver o plano pai",
      linkedTask: "Ver a tarefa vinculada",
      linkedPlan: "Ver o plano vinculado"
    },
    deleted: "Excluído",
    updated: "Atualizado",
    createdVerb: "Criado",
    moreFields: "+{count} campos a mais"
  },
  list: {
    untitledPlan: "Plano sem título",
    untitledSession: "Sessão sem título",
    msgOne: "{count} msg",
    msgMany: "{count} msgs",
    energy: "Nível de energia",
    target: "alvo: {date}",
    noResults: "Sem resultados",
    resultOne: "{count} resultado",
    resultMany: "{count} resultados",
    matching: "correspondendo a “{query}”"
  },
  viz: {
    noRadar: "Nenhum dado de radar disponível.",
    unknownTarget: "desconhecido",
    direct: "Direto ({count})",
    transitive: "Transitivo ({count})",
    total: "{count} no total",
    importance: {
      critical: "CRÍTICA",
      high: "ALTA",
      medium: "MÉDIA",
      low: "BAIXA"
    },
    kind: {
      guideline: "guideline",
      gotcha: "armadilha",
      pattern: "padrão",
      context: "contexto",
      tip: "dica",
      observation: "observação",
      assertion: "asserção",
      decision: "decisão"
    }
  },
  permission: {
    actions: "Responder a este pedido de permissão",
    allowOnce: "Permitir uma vez",
    allowSession: "Para esta sessão",
    allowAlways: "Sempre",
    deny: "Negar",
    sessionHint: "Não será perguntado de novo nesta conversa",
    alwaysHint: "Não será perguntado de novo neste projeto, nem após reiniciar",
    allowed: "Permitido",
    allowedSession: "Permitido para a sessão",
    allowedAlways: "Sempre permitido",
    denied: "Negado"
  }
} satisfies Translation<'chatA-tools'>
