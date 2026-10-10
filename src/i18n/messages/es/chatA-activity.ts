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
    tooFast: "Cancelaciones demasiado rápidas — inténtalo de nuevo en un momento.",
    cancelFailed: "No se pudo cancelar la tarea — usa mejor el botón Detener global.",
    runningAria: "En ejecución: {summary}",
    stoppedOne: "{count} subproceso detenido.",
    stoppedMany: "{count} subprocesos detenidos.",
    noPid: "Cancelación registrada, pero se desconocía el PID del subproceso — si siguen llegando señales, usa el botón Detener global."
  },
  cancel: {
    alreadyStopped: "ya detenido",
    notStopped: "no detenido — usa el botón Detener global",
    alreadyStoppedNotice: "Ya detenido — ya no se estaba ejecutando nada.",
    retryNotice: "Aún no detenido — inténtalo de nuevo en un momento.",
    timeoutNotice: "La detención no recibió respuesta a tiempo — puede que aún ocurra.",
    failedNotice: "No se pudieron detener las herramientas — usa mejor el botón Detener global.",
    taskRefusedNotice: "Este proveedor no puede detener una sola tarea en segundo plano. Usa Detener en el compositor para interrumpir todo el turno."
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
    kind: {
      workflow: "Workflow",
      shell: "Comando en segundo plano",
      monitor: "Monitor",
      agent: "Subagente",
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
  }
} satisfies Translation<'chatA-activity'>
