import type { Translation } from '../../catalog.ts'

export default {
  kindName: {
    run: "запуск",
    workflow: "воркфлоу",
    agent: "агент",
    shell: "шел",
    monitor: "монітор"
  },
  kindCount: {
    run: {
      one: "Запусків: {count}",
      many: "Запусків: {count}"
    },
    workflow: {
      one: "Воркфлоу: {count}",
      many: "Воркфлоу: {count}"
    },
    agent: {
      one: "Агентів: {count}",
      many: "Агентів: {count}"
    },
    shell: {
      one: "Шелів: {count}",
      many: "Шелів: {count}"
    },
    monitor: {
      one: "Моніторів: {count}",
      many: "Моніторів: {count}"
    }
  },
  row: {
    progress: "Агентів: {settled}/{total}",
    stopping: "зупиняється…",
    stoppingTitle: "Зупиняється…",
    stop: "Зупинити",
    stopAria: "Зупинити {title}",
    stopRun: "Зупинити цей запуск",
    show: "Показати в розмові",
    showAria: "Показати {title} у розмові",
    openConversation: "Відкрити його розмову",
    openConversationAria: "Відкрити розмову {title}",
    dashboard: "Відкрити панель раннера",
    dashboardAria: "Відкрити панель раннера для {title}"
  },
  bar: {
    tooFast: "Надто швидке скасування — повторіть за мить.",
    cancelFailed: "Не вдалося скасувати завдання — натомість скористайтеся загальною зупинкою.",
    runningAria: "Виконується: {summary}",
    stoppedOne: "Зупинено підпроцесів: {count}.",
    stoppedMany: "Зупинено підпроцесів: {count}.",
    noPid: "Скасування зареєстровано, але PID підпроцесу невідомий — якщо події й надалі надходять, натисніть загальну кнопку зупинки."
  },
  cancel: {
    alreadyStopped: "вже зупинено",
    notStopped: "не зупинено",
    alreadyStoppedNotice: "Вже зупинено — нічого більше не виконувалося.",
    retryNotice: "Ще не зупинено — спробуйте ще раз за мить.",
    timeoutNotice: "Зупинка не отримала відповіді вчасно — вона ще може відбутися.",
    failedNotice: "Не вдалося зупинити інструменти — натомість скористайтеся загальною зупинкою."
  },
  agent: {
    subAgent: "Субагент",
    toolOne: "Інструментів: {count}",
    toolMany: "Інструментів: {count}",
    running: "Виконується: {count}",
    runningIndicator: "Агент працює..."
  },
  status: {
    spawning: "запускається",
    running: "виконується",
    verifying: "перевіряється",
    completed: "завершено",
    failed: "збій",
    interrupted: "перервано"
  },
  banner: {
    elapsed: "Минуло",
    cost: "Вартість",
    ram: "RAM (резидентна)",
    cpu: "CPU",
    pidTitle: "PID {pid} · потоків: {threads} · {status}",
    viewAgent: "Переглянути розмову цього агента",
    view: "Відкрити",
    interrupt: "Перервати цього агента",
    runTitle: "Запуск {id}",
    runShort: "запуск {id}",
    wave: "Хвиля {wave}",
    openDashboard: "Відкрити повну панель раннера",
    dashboard: "Панель",
    spawning: "Запуск агентів…",
    noAgents: "Немає активних агентів",
    title: "Агентний режим",
    activeOne: "Активних запусків: {count}",
    activeMany: "Активних запусків: {count}",
    cumulative: "загалом {cost}"
  },
  pill: {
    title: "Агентний режим",
    state: {
      idle: "простій",
      ready: "готовий",
      running: "виконується",
      completed: "завершено"
    },
    workingOne: "Агентний режим — працює агентів: {count}",
    workingMany: "Агентний режим — працює агентів: {count}",
    completedOne: "Агентний режим — завершено запусків: {count}",
    completedMany: "Агентний режим — завершено запусків: {count}",
    ready: "Агентний режим — готовий",
    streamingOne: "Запусків у потоковому режимі зараз: {count}. Банер нижче показує агентів у реальному часі.",
    streamingMany: "Запусків у потоковому режимі зараз: {count}. Банер нижче показує агентів у реальному часі.",
    more: "+ ще {count}",
    readyNote: "У цього чату є пов’язані плани, але зараз жоден не передається потоком.",
    ranOne: "З цього чату запущено: {count}. Зараз жоден не передається потоком.",
    ranMany: "З цього чату запущено: {count}. Зараз жоден не передається потоком.",
    openDashboard: "Відкрити панель раннера"
  },
  bg: {
    title: "Фонова активність",
    listAria: "Фонові активності",
    summary: {
      running: "Виконується: {count}",
      queued: "У черзі: {count}",
      failed: "Із помилкою: {count}",
      done: "Готово: {count}",
      cancelled: "Скасовано: {count}",
      ended: "Завершено: {count}"
    }
  },
  card: {
    showMore: "Показати більше",
    showLess: "Показати менше",
    lineOne: "Рядків: {count}",
    lineMany: "Рядків: {count}",
    earlierLineOne: "Показати попередні рядки: {count}",
    earlierLineMany: "Показати попередні рядки: {count}",
    progressOf: "Прогрес {title}",
    agents: "Агентів: {settled}/{total}",
    agentsOf: "Агенти {title}",
    tokens: "Токенів: {count}",
    toolUseOne: "Викликів інструментів: {count}",
    toolUseMany: "Викликів інструментів: {count}",
    timeline: "Хронологія",
    eventOne: "Подій: {count}",
    eventMany: "Подій: {count}",
    eventsOf: "Події {title}",
    hiddenEventOne: "… попередні події не збережено: {count}",
    hiddenEventMany: "… попередні події не збережено: {count}",
    rawPayload: "Вихідні дані",
    parameters: "Параметри",
    latestOutput: "Останній вивід",
    output: "Вивід",
    kind: {
      workflow: "Воркфлоу",
      shell: "Фонова команда",
      monitor: "Монітор",
      agent: "Субагент",
      generic: "Фонова активність"
    },
    status: {
      running: "Виконується",
      queued: "У черзі",
      done: "Готово",
      failed: "Збій",
      cancelled: "Скасовано",
      ended: "Завершено"
    }
  },
  runs: {
    finished: "Завершено",
    view: "Переглянути запуск",
    stop: "Зупинити запуск",
    loading: "Завантаження виконань…",
    noDetails: "Подробиці виконання недоступні.",
    inProgressOne: "Запусків у роботі: {count}",
    inProgressMany: "Запусків у роботі: {count}",
    completedOne: "Завершено запусків: {count}",
    completedMany: "Завершено запусків: {count}",
    done: "Готово: {count}"
  }
} satisfies Translation<'chatA-activity'>
