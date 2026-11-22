import type { Translation } from '../../catalog.ts'

export default {
  kindName: {
    run: "ejecución",
    workflow: "workflow",
    agent: "agente",
    shell: "shell",
    monitor: "monitor"
  },
  kindCount: {
    run: {
      one: "{count} ejecución",
      many: "{count} ejecuciones"
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
    stopping: "deteniendo…",
    stoppingTitle: "Deteniendo…",
    stop: "Detener",
    stopAria: "Detener {title}",
    stopRun: "Detener esta ejecución",
    show: "Mostrar en la conversación",
    showAria: "Mostrar {title} en la conversación",
    openConversation: "Abrir su conversación",
    openConversationAria: "Abrir la conversación de {title}",
    dashboard: "Abrir el panel del runner",
    dashboardAria: "Abrir el panel del runner de {title}"
  },
  bar: {
    acknowledge: "He comprobado esta tarea — permitir otra solicitud",
    runningAria: "En ejecución: {summary}",
    stoppedOne: "Se aceptó la señal para {count} proceso. Puede seguir ejecutándose.",
    stoppedMany: "Se aceptó la señal para {count} procesos. Pueden seguir ejecutándose.",
    noPid: "No se confirmó ninguna señal para esta tarea. El resultado es desconocido; compruebe su actividad."
  },
  cancelAll: {
    open: "Detener las herramientas de la sesión, incluidas las de los subagentes",
    explain: "Esto envía una señal de interrupción a todos los procesos de herramientas de esta sesión, mientras el turno continúa. Los procesos pueden ignorar la señal o sobrevivir. Compruebe después su estado real. Los procesos de herramientas de los subagentes también pueden verse afectados si son descendientes; algunos pueden sobrevivir.",
    confirm: "Enviar la interrupción a las herramientas de la sesión y de los subagentes",
    back: "Volver",
    sending: "Enviando interrupción…",
    signalled: "Se recibió una respuesta de un propietario. Una señal no garantiza que los procesos se detengan; otras operaciones pueden seguir en curso. Compruebe la actividad de la sesión.",
    capped: "Un propietario notificó un límite de frecuencia. Otros aún pueden actuar; compruebe la sesión antes de volver a intentarlo.",
    uncertain: "Resultado desconocido. La señal aún puede enviarse; compruebe la sesión antes de volver a intentarlo.",
    refused: "Se recibió un rechazo de un motor.",
    unsupported: "Este proveedor no puede detener todas las herramientas de esta sesión.",
    ownerUnreachable: "Propietario inaccesible; no se confirmó ninguna detención. Compruebe la actividad de la sesión.",
    identityChanged: "No se envió ninguna solicitud: no se pudo verificar la identidad autenticada. Compruebe su sesión e inicie sesión de nuevo si es necesario.",
    reset: "He comprobado esta sesión: permitir otra solicitud",
  },
  cancel: {
    unsupportedNotice: "Se recibió un rechazo; la detención no está confirmada. Compruebe la actividad de la sesión.",
    unknownNotice: "Se desconoce el resultado de esta solicitud de detención. Compruebe la actividad de la sesión.",
    retryNotice: "El resultado no está confirmado. Compruebe la actividad antes de volver a intentar detener esta tarea.",
    timeoutNotice: "La detención no recibió respuesta a tiempo — puede que aún ocurra.",
    taskRefusedNotice: "Se recibió un rechazo; la detención no está confirmada. Compruebe la actividad de la sesión.",
    unauthenticatedNotice: 'Autenticación rechazada (401): su sesión de usuario falta o ha caducado. No se confirmó ninguna detención; vuelva a iniciar sesión y compruebe la actividad de la sesión.',
    forbiddenNotice: 'Autorización rechazada (403): esta cuenta no puede detener estas herramientas. No se confirmó ninguna detención; compruebe la actividad de la sesión.',
  },
  stopDialog: {
    title: "Detener las herramientas de esta sesión",
    description: "No se envía nada hasta que confirmes. Desmarca lo que deba seguir en marcha.",
    empty: "No hay actividad individual en la lista. Confirmar detiene todas las herramientas de la sesión, también las de primer plano.",
    selected: "{selected} de {total} seleccionados",
    quick: {
      label: "Selecciones rápidas",
      all: "Todo",
      none: "Nada",
      onlyOld: "Solo las antiguas",
      onlyOldHint: "Desmarca lo que empezó hace menos de {minutes} minutos",
      keepBackground: "Mantener las tareas en segundo plano",
      keepMonitors: "Mantener los monitores",
      keepAgents: "Mantener los subagentes",
    },
    group: { agent: "Subagentes", background: "Tareas en segundo plano", monitor: "Monitores", other: "Otros" },
    age: { unknown: "antigüedad desconocida", lessThanMinute: "desde hace menos de 1 min", minutes: "desde hace {count} min", hours: "desde hace {count} h" },
    alreadyRequested: "Ya se pidió detener esta tarea.",
    foregroundWarning: "Las herramientas en primer plano no se detienen: no tienen identificador propio. Solo «Todo» las detiene.",
    untargetableWarning: "Elementos marcados que no se pueden detener uno a uno (subagentes, ejecuciones): {count}. Siguen en marcha salvo que todo esté marcado.",
    confirmOne: "Detener {count} elemento",
    confirmMany: "Detener {count} elementos",
    cancel: "Cancelar",
    close: "Cerrar",
    resultsIntro: "Resultado de cada elemento. Una señal no garantiza que el proceso se haya detenido.",
    results: "Resultados por elemento",
  },
  agent: {
    subAgent: "Subagente",
    toolOne: "{count} herramienta",
    toolMany: "{count} herramientas",
    running: "{count} en ejecución",
    runningIndicator: "Agente en ejecución..."
  },
  status: {
    spawning: "iniciando",
    running: "en ejecución",
    verifying: "verificando",
    completed: "completado",
    failed: "fallido",
    interrupted: "interrumpido"
  },
  banner: {
    elapsed: "Transcurrido",
    cost: "Coste",
    ram: "RAM (residente)",
    cpu: "CPU",
    pidTitle: "PID {pid} · {threads} hilos · {status}",
    viewAgent: "Ver la conversación de este agente",
    view: "Ver",
    interrupt: "Interrumpir este agente",
    runTitle: "Ejecución {id}",
    runShort: "ejec. {id}",
    wave: "Oleada {wave}",
    openDashboard: "Abrir el panel completo del runner",
    dashboard: "Panel",
    spawning: "Iniciando agentes…",
    noAgents: "Ningún agente activo",
    title: "Modo agéntico",
    activeOne: "{count} ejecución activa",
    activeMany: "{count} ejecuciones activas",
    cumulative: "acumulado {cost}"
  },
  pill: {
    title: "Modo agéntico",
    state: {
      idle: "inactivo",
      ready: "listo",
      running: "en ejecución",
      completed: "completado"
    },
    workingOne: "Modo agéntico — {count} agente trabajando",
    workingMany: "Modo agéntico — {count} agentes trabajando",
    completedOne: "Modo agéntico — {count} ejecución completada",
    completedMany: "Modo agéntico — {count} ejecuciones completadas",
    ready: "Modo agéntico — listo",
    streamingOne: "{count} ejecución en streaming ahora mismo. El banner de abajo muestra los agentes en tiempo real.",
    streamingMany: "{count} ejecuciones en streaming ahora mismo. El banner de abajo muestra los agentes en tiempo real.",
    more: "+ {count} más",
    readyNote: "Hay planes vinculados a este chat, pero ninguno está en streaming ahora mismo.",
    ranOne: "{count} ejecución lanzada desde este chat. Ninguna está en streaming ahora mismo.",
    ranMany: "{count} ejecuciones lanzadas desde este chat. Ninguna está en streaming ahora mismo.",
    openDashboard: "Abrir el panel del runner"
  },
  bg: {
    title: "Actividad en segundo plano",
    listAria: "Actividades en segundo plano",
    noWork: "solo avisos del proveedor",
    noticeOne: "{count} aviso del proveedor",
    noticeMany: "{count} avisos del proveedor",
    noticesAria: "Avisos del proveedor — telemetría, sin trabajo",
    summary: {
      running: "{count} en ejecución",
      queued: "{count} en cola",
      failed: "{count} fallidas",
      done: "{count} completadas",
      cancelled: "{count} canceladas",
      ended: "{count} finalizadas"
    }
  },
  card: {
    showMore: "Mostrar más",
    showLess: "Mostrar menos",
    lineOne: "{count} línea",
    lineMany: "{count} líneas",
    earlierLineOne: "Mostrar {count} línea anterior",
    earlierLineMany: "Mostrar {count} líneas anteriores",
    progressOf: "Progreso de {title}",
    agents: "{settled}/{total} agentes",
    agentsOf: "Agentes de {title}",
    tokens: "{count} tokens",
    toolUseOne: "{count} uso de herramienta",
    toolUseMany: "{count} usos de herramienta",
    timeline: "Cronología",
    eventOne: "{count} evento",
    eventMany: "{count} eventos",
    eventsOf: "Eventos de {title}",
    hiddenEventOne: "… {count} evento anterior no conservado",
    hiddenEventMany: "… {count} eventos anteriores no conservados",
    rawPayload: "Datos sin procesar",
    parameters: "Parámetros",
    latestOutput: "Última salida",
    output: "Salida",
    result: "Resultado",
    watched: "Salida vigilada",
    outputInFile: "La salida fue al archivo de la tarea (arriba); el proveedor no la envía al flujo.",
    toolsAria: "Herramientas usadas",
    kind: {
      workflow: "Workflow",
      shell: "Comando en segundo plano",
      monitor: "Monitor",
      agent: "Subagente",
      message: "Agente en segundo plano",
      notice: "Aviso del proveedor",
      generic: "Actividad en segundo plano"
    },
    status: {
      running: "En ejecución",
      queued: "En cola",
      done: "Completada",
      failed: "Fallida",
      cancelled: "Cancelada",
      ended: "Finalizada"
    }
  },
  runs: {
    finished: "Finalizada",
    view: "Ver ejecución",
    stop: "Detener ejecución",
    loading: "Cargando ejecuciones…",
    noDetails: "No hay detalles de ejecución disponibles.",
    inProgressOne: "{count} ejecución en curso",
    inProgressMany: "{count} ejecuciones en curso",
    completedOne: "{count} ejecución completada",
    completedMany: "{count} ejecuciones completadas",
    done: "{count} completadas"
  },
  work: {
    kind: {
      plan: "plan",
      task: "tarea"
    },
    steps: "paso {done}/{total}",
    openPlan: "Abrir el plan {title}",
    openTask: "Abrir la tarea {title}",
    plans: {
      one: "{count} plan",
      many: "{count} planes"
    },
    tasks: {
      one: "{count} tarea",
      many: "{count} tareas"
    },
    barAria: "En curso: {summary}",
    barAriaCurrent: "En curso: {summary} — tarea actual: {title}"
  }
} satisfies Translation<'chatA-activity'>
