import type { Translation } from '../../catalog.ts'

export default {
  bash: {
    emptyCommand: "(comando vacío)",
    showLess: "mostrar menos",
    showMore: "mostrar {count} caracteres más",
    noOutput: "sin salida",
    running: "en ejecución..."
  },
  default: {
    input: "Entrada",
    error: "Error",
    result: "Resultado",
    truncated: "... (truncado)"
  },
  edit: {
    replaceAll: "reemplazar todo",
    removedLineOne: "-{count} línea",
    removedLineMany: "-{count} líneas",
    addedLineOne: "+{count} línea",
    addedLineMany: "+{count} líneas",
    moreRemovedOne: "... {count} línea eliminada más",
    moreRemovedMany: "... {count} líneas eliminadas más",
    moreAddedOne: "... {count} línea añadida más",
    moreAddedMany: "... {count} líneas añadidas más",
    truncated: "... (truncado)",
    editing: "editando..."
  },
  chat: {
    you: "Tú",
    assistant: "Asistente",
    messageOne: "{count} mensaje",
    messageMany: "{count} mensajes"
  },
  code: {
    copyPath: "Copiar ruta",
    noResults: "Sin resultados",
    searchResults: "Resultados de búsqueda",
    noSymbols: "No se encontraron símbolos",
    noReferences: "No se encontraron referencias",
    unknownFile: "(desconocido)",
    references: "Referencias",
    calledBy: "Llamada por",
    calls: "Llama a",
    noCallGraph: "Sin datos del grafo de llamadas",
    callersColon: "llamadores:",
    dependentFiles: "Archivos dependientes",
    mostConnected: "Archivos más conectados",
    imports: "Importaciones",
    importedBy: "Importado por",
    label: {
      results: "resultados",
      files: "archivos",
      callers: "llamadores",
      callees: "llamados",
      imports: "importaciones",
      dependents: "dependientes"
    },
    cat: {
      functions: "funciones",
      structs: "structs",
      enums: "enums",
      traits: "traits",
      impls: "impls",
      macros: "macros",
      constants: "constantes",
      type_aliases: "alias de tipo"
    },
    symbols: {
      implementations: "Implementaciones",
      traits: "Traits",
      impls: "Bloques impl"
    },
    symbolsNone: {
      implementations: "No se encontraron implementaciones",
      traits: "No se encontraron traits",
      impls: "No se encontraron bloques impl"
    }
  },
  entity: {
    project: "proyecto",
    created: "creado",
    plan: "plan",
    path: "ruta",
    synced: "sincronizado",
    target: "objetivo",
    verify: "verificación",
    tasks: "Tareas",
    constraints: "Restricciones",
    criteria: "Criterios de aceptación",
    steps: "Pasos",
    decisions: "Decisiones",
    label: {
      tasks: "tareas",
      constraints: "restricciones",
      criteria: "criterios",
      steps: "pasos",
      decisions: "decisiones"
    },
    type: {
      plan: "plan",
      task: "tarea",
      project: "proyecto",
      milestone: "hito",
      workspace: "espacio de trabajo",
      note: "nota",
      release: "release"
    },
    view: {
      entity: "Ver {entity}",
      parentTask: "Ver la tarea padre",
      parentPlan: "Ver el plan padre",
      linkedTask: "Ver la tarea vinculada",
      linkedPlan: "Ver el plan vinculado"
    },
    deleted: "Eliminado",
    updated: "Actualizado",
    createdVerb: "Creado",
    moreFields: "+{count} campos más"
  },
  list: {
    untitledPlan: "Plan sin título",
    untitledSession: "Sesión sin título",
    msgOne: "{count} msg",
    msgMany: "{count} msgs",
    energy: "Nivel de energía",
    target: "objetivo: {date}",
    noResults: "Sin resultados",
    resultOne: "{count} resultado",
    resultMany: "{count} resultados",
    matching: "coincidencias con «{query}»"
  },
  viz: {
    noRadar: "No hay datos de radar disponibles.",
    unknownTarget: "desconocido",
    direct: "Directo ({count})",
    transitive: "Transitivo ({count})",
    total: "{count} en total",
    importance: {
      critical: "CRÍTICA",
      high: "ALTA",
      medium: "MEDIA",
      low: "BAJA"
    },
    kind: {
      guideline: "guideline",
      gotcha: "trampa",
      pattern: "patrón",
      context: "contexto",
      tip: "consejo",
      observation: "observación",
      assertion: "aserción",
      decision: "decisión"
    }
  },
  permission: {
    actions: "Responder a esta solicitud de permiso",
    allowOnce: "Permitir una vez",
    allowSession: "Para esta sesión",
    deny: "Denegar",
    sessionHint: "No se volverá a preguntar en esta conversación para esta llamada exacta",
    awaiting: "Esperando la confirmación…",
    sessionCovers: "Si se concede, «Para esta sesión» solo cubre:",
    forbidden: "Solo la persona a quien pertenece esta conversación puede responder. No se respondió nada.",
    ownerUnreadable: "No se pudo comprobar a quién pertenece esta conversación. No se respondió nada: inténtelo de nuevo.",
    unconfirmed: "No llegó ninguna confirmación. Responda de nuevo.",
    scopeRefused: "Este permiso no puede conservarse para la sesión (la llamada ejecuta otro comando, o la sesión no lo ofrece). Responda una vez o deniegue.",
    allowed: "Permitido",
    allowedSession: "Permitido para la sesión",
    denied: "Denegado"
  }
} satisfies Translation<'chatA-tools'>
