import type { Translation } from '../../catalog.ts'

export default {
  bash: {
    emptyCommand: "(пустая команда)",
    showLess: "показать меньше",
    showMore: "показать ещё символов: {count}",
    noOutput: "нет вывода",
    running: "выполняется..."
  },
  default: {
    input: "Ввод",
    error: "Ошибка",
    result: "Результат",
    truncated: "... (обрезано)"
  },
  edit: {
    replaceAll: "заменить все",
    removedLineOne: "−{count} строк",
    removedLineMany: "−{count} строк",
    addedLineOne: "+{count} строк",
    addedLineMany: "+{count} строк",
    moreRemovedOne: "... ещё удалённых строк: {count}",
    moreRemovedMany: "... ещё удалённых строк: {count}",
    moreAddedOne: "... ещё добавленных строк: {count}",
    moreAddedMany: "... ещё добавленных строк: {count}",
    truncated: "... (обрезано)",
    editing: "редактирование..."
  },
  chat: {
    you: "Вы",
    assistant: "Ассистент",
    messageOne: "Сообщений: {count}",
    messageMany: "Сообщений: {count}"
  },
  code: {
    copyPath: "Копировать путь",
    noResults: "Нет результатов",
    searchResults: "Результаты поиска",
    noSymbols: "Символы не найдены",
    noReferences: "Ссылки не найдены",
    unknownFile: "(неизвестно)",
    references: "Ссылки",
    calledBy: "Вызывается из",
    calls: "Вызывает",
    noCallGraph: "Нет данных графа вызовов",
    callersColon: "вызывающие:",
    dependentFiles: "Зависимые файлы",
    mostConnected: "Наиболее связанные файлы",
    imports: "Импорты",
    importedBy: "Импортируется в",
    label: {
      results: "результаты",
      files: "файлы",
      callers: "вызывающие",
      callees: "вызываемые",
      imports: "импорты",
      dependents: "зависимые"
    },
    cat: {
      functions: "функции",
      structs: "структуры",
      enums: "перечисления",
      traits: "трейты",
      impls: "impl",
      macros: "макросы",
      constants: "константы",
      type_aliases: "псевдонимы типов"
    },
    symbols: {
      implementations: "Реализации",
      traits: "Трейты",
      impls: "Блоки impl"
    },
    symbolsNone: {
      implementations: "Реализации не найдены",
      traits: "Трейты не найдены",
      impls: "Блоки impl не найдены"
    }
  },
  entity: {
    project: "проект",
    created: "создано",
    plan: "план",
    path: "путь",
    synced: "синхронизировано",
    target: "цель",
    verify: "проверка",
    tasks: "Задачи",
    constraints: "Ограничения",
    criteria: "Критерии приёмки",
    steps: "Шаги",
    decisions: "Решения",
    label: {
      tasks: "задачи",
      constraints: "ограничения",
      criteria: "критерии",
      steps: "шаги",
      decisions: "решения"
    },
    type: {
      plan: "план",
      task: "задача",
      project: "проект",
      milestone: "веха",
      workspace: "рабочее пространство",
      note: "заметка",
      release: "релиз"
    },
    view: {
      entity: "Открыть: {entity}",
      parentTask: "Открыть родительскую задачу",
      parentPlan: "Открыть родительский план",
      linkedTask: "Открыть связанную задачу",
      linkedPlan: "Открыть связанный план"
    },
    deleted: "Удалено",
    updated: "Обновлено",
    createdVerb: "Создано",
    moreFields: "+ ещё полей: {count}"
  },
  list: {
    untitledPlan: "План без названия",
    untitledSession: "Сессия без названия",
    msgOne: "Сообщ.: {count}",
    msgMany: "Сообщ.: {count}",
    energy: "Уровень энергии",
    target: "цель: {date}",
    noResults: "Нет результатов",
    resultOne: "Результатов: {count}",
    resultMany: "Результатов: {count}",
    matching: "по запросу «{query}»"
  },
  viz: {
    noRadar: "Данные радара недоступны.",
    unknownTarget: "неизвестно",
    direct: "Прямые ({count})",
    transitive: "Транзитивные ({count})",
    total: "всего {count}",
    importance: {
      critical: "КРИТИЧНО",
      high: "ВЫСОКАЯ",
      medium: "СРЕДНЯЯ",
      low: "НИЗКАЯ"
    },
    kind: {
      guideline: "руководство",
      gotcha: "подвох",
      pattern: "паттерн",
      context: "контекст",
      tip: "совет",
      observation: "наблюдение",
      assertion: "утверждение",
      decision: "решение"
    }
  },
  permission: {
    actions: "Ответить на этот запрос разрешения",
    allowOnce: "Разрешить один раз",
    allowSession: "На этот сеанс",
    deny: "Запретить",
    sessionHint: "Больше не спрашивать в этом разговоре для этого же вызова",
    awaiting: "Ожидание подтверждения…",
    sessionCovers: "Если разрешить, «На этот сеанс» распространяется только на:",
    forbidden: "Отвечать может только владелец этого разговора. Ответ не отправлен.",
    ownerUnreadable: "Не удалось проверить, кому принадлежит этот разговор. Ответ не отправлен: попробуйте ещё раз.",
    unconfirmed: "Подтверждение не получено. Ответьте ещё раз.",
    scopeRefused: "Это разрешение нельзя сохранить на сеанс (вызов запускает другую команду, или сеанс этого не предлагает). Разрешите один раз или запретите.",
    allowed: "Разрешено",
    allowedSession: "Разрешено на сеанс",
    denied: "Запрещено",
    allowAlways: "Всегда",
    alwaysHint: "Больше не спрашивать об этом точном вызове в ваших беседах по этому проекту, работающих в его каталоге, на этой машине",
    alwaysCovers: "Если разрешено, «Всегда» охватывает только:",
    alwaysRefused: "Этот вызов нельзя разрешить навсегда (только точное чтение или одну команду только для чтения без перенаправления и цепочек). Ответьте один раз или на сеанс.",
    allowedAlways: "Разрешено всегда"
  },
  lastingRules: {
    title: "Всегда разрешённые вызовы",
    description: "Вызовы, которые вы разрешили навсегда, по проектам. Каждое разрешение охватывает только этот точный вызов в беседах, работающих в каталоге проекта на этой машине. После отзыва он снова запрашивается со следующего запроса на этой машине.",
    empty: "Ни один вызов не разрешён навсегда.",
    disabled: "Этот сервер не хранит постоянные разрешения.",
    revoke: "Отозвать",
    revoked: "Отозвано: снова запрашивается со следующего запроса на этой машине.",
    loadFailed: "Не удалось загрузить ваши постоянные разрешения.",
    revokeFailed: "Не удалось отозвать. Попробуйте снова.",
    notHeld: "Больше не действует",
    engineNative: "встроенный движок",
    engineClaudeCode: "Claude Code",
    sandboxDisabled: "вне песочницы"
  }
} satisfies Translation<'chatA-tools'>
