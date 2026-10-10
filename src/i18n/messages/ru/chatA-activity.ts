import type { Translation } from '../../catalog.ts'

export default {
  kindName: {
    run: "запуск",
    workflow: "воркфлоу",
    agent: "агент",
    shell: "шелл",
    monitor: "монитор"
  },
  kindCount: {
    run: {
      one: "Запусков: {count}",
      many: "Запусков: {count}"
    },
    workflow: {
      one: "Воркфлоу: {count}",
      many: "Воркфлоу: {count}"
    },
    agent: {
      one: "Агентов: {count}",
      many: "Агентов: {count}"
    },
    shell: {
      one: "Шеллов: {count}",
      many: "Шеллов: {count}"
    },
    monitor: {
      one: "Мониторов: {count}",
      many: "Мониторов: {count}"
    }
  },
  row: {
    progress: "Агентов: {settled}/{total}",
    stopping: "останавливается…",
    stoppingTitle: "Останавливается…",
    stop: "Остановить",
    stopAria: "Остановить {title}",
    stopRun: "Остановить этот запуск",
    show: "Показать в беседе",
    showAria: "Показать {title} в беседе",
    openConversation: "Открыть его беседу",
    openConversationAria: "Открыть беседу {title}",
    dashboard: "Открыть панель раннера",
    dashboardAria: "Открыть панель раннера для {title}"
  },
  bar: {
    tooFast: "Слишком быстрая отмена — повторите через мгновение.",
    cancelFailed: "Не удалось отменить задачу — используйте общую остановку.",
    runningAria: "Выполняется: {summary}",
    stoppedOne: "Остановлено подпроцессов: {count}.",
    stoppedMany: "Остановлено подпроцессов: {count}.",
    noPid: "Отмена зарегистрирована, но PID подпроцесса неизвестен — если события продолжают приходить, нажмите общую кнопку остановки."
  },
  agent: {
    subAgent: "Субагент",
    toolOne: "Инструментов: {count}",
    toolMany: "Инструментов: {count}",
    running: "Выполняется: {count}",
    runningIndicator: "Агент работает..."
  },
  status: {
    spawning: "запускается",
    running: "выполняется",
    verifying: "проверяется",
    completed: "завершён",
    failed: "сбой",
    interrupted: "прерван"
  },
  banner: {
    elapsed: "Прошло",
    cost: "Стоимость",
    ram: "RAM (резидентная)",
    cpu: "CPU",
    pidTitle: "PID {pid} · потоков: {threads} · {status}",
    viewAgent: "Посмотреть беседу этого агента",
    view: "Открыть",
    interrupt: "Прервать этого агента",
    runTitle: "Запуск {id}",
    runShort: "запуск {id}",
    wave: "Волна {wave}",
    openDashboard: "Открыть полную панель раннера",
    dashboard: "Панель",
    spawning: "Запуск агентов…",
    noAgents: "Нет активных агентов",
    title: "Агентный режим",
    activeOne: "Активных запусков: {count}",
    activeMany: "Активных запусков: {count}",
    cumulative: "всего {cost}"
  },
  pill: {
    title: "Агентный режим",
    state: {
      idle: "простой",
      ready: "готов",
      running: "выполняется",
      completed: "завершён"
    },
    workingOne: "Агентный режим — работает агентов: {count}",
    workingMany: "Агентный режим — работает агентов: {count}",
    completedOne: "Агентный режим — завершено запусков: {count}",
    completedMany: "Агентный режим — завершено запусков: {count}",
    ready: "Агентный режим — готов",
    streamingOne: "Запусков в потоковом режиме сейчас: {count}. Баннер ниже показывает агентов в реальном времени.",
    streamingMany: "Запусков в потоковом режиме сейчас: {count}. Баннер ниже показывает агентов в реальном времени.",
    more: "+ ещё {count}",
    readyNote: "У этого чата есть связанные планы, но сейчас ни один не передаётся потоком.",
    ranOne: "Из этого чата запущено: {count}. Сейчас ни один не передаётся потоком.",
    ranMany: "Из этого чата запущено: {count}. Сейчас ни один не передаётся потоком.",
    openDashboard: "Открыть панель раннера"
  },
  bg: {
    title: "Фоновая активность",
    listAria: "Фоновые активности",
    summary: {
      running: "Выполняется: {count}",
      queued: "В очереди: {count}",
      failed: "С ошибкой: {count}",
      done: "Готово: {count}",
      cancelled: "Отменено: {count}",
      ended: "Завершено: {count}"
    }
  },
  card: {
    showMore: "Показать больше",
    showLess: "Показать меньше",
    lineOne: "Строк: {count}",
    lineMany: "Строк: {count}",
    earlierLineOne: "Показать предыдущие строки: {count}",
    earlierLineMany: "Показать предыдущие строки: {count}",
    progressOf: "Прогресс {title}",
    agents: "Агентов: {settled}/{total}",
    agentsOf: "Агенты {title}",
    tokens: "Токенов: {count}",
    toolUseOne: "Вызовов инструментов: {count}",
    toolUseMany: "Вызовов инструментов: {count}",
    timeline: "Хронология",
    eventOne: "Событий: {count}",
    eventMany: "Событий: {count}",
    eventsOf: "События {title}",
    hiddenEventOne: "… более ранние события не сохранены: {count}",
    hiddenEventMany: "… более ранние события не сохранены: {count}",
    rawPayload: "Исходные данные",
    parameters: "Параметры",
    latestOutput: "Последний вывод",
    output: "Вывод",
    kind: {
      workflow: "Воркфлоу",
      shell: "Фоновая команда",
      monitor: "Монитор",
      agent: "Субагент",
      generic: "Фоновая активность"
    },
    status: {
      running: "Выполняется",
      queued: "В очереди",
      done: "Готово",
      failed: "Сбой",
      cancelled: "Отменено",
      ended: "Завершено"
    }
  },
  runs: {
    finished: "Завершено",
    view: "Открыть запуск",
    stop: "Остановить запуск",
    loading: "Загрузка выполнений…",
    noDetails: "Подробности выполнения недоступны.",
    inProgressOne: "Запусков в работе: {count}",
    inProgressMany: "Запусков в работе: {count}",
    completedOne: "Завершено запусков: {count}",
    completedMany: "Завершено запусков: {count}",
    done: "Готово: {count}"
  }
} satisfies Translation<'chatA-activity'>
