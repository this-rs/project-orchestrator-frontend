import type { Translation } from '../../catalog.ts'

export default {
  copy: {
    title: "Copiar como markdown",
    copied: "¡Copiado!",
    popupTitle: "Markdown del mensaje"
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
    afterOne: "tras {count} turno",
    afterMany: "tras {count} turnos"
  },
  bubble: {
    references: "Referencias",
    attachments: "Adjuntos",
    copyMessage: "Copiar el mensaje como markdown",
    copyReply: "Copiar la respuesta como markdown",
    thinking: "Pensando..."
  },
  list: {
    loading: "Cargando mensajes...",
    loadingOlder: "Cargando mensajes anteriores...",
    beginning: "— Inicio de la conversación —",
    loadingNewer: "Cargando mensajes más recientes...",
    scrollMore: "— Desplázate hacia abajo para ver más —",
    catchingUp: "Poniéndose al día…",
    newActivity: "Nueva actividad ↓"
  },
  compaction: {
    label: "Compactando el contexto"
  },
  welcome: {
    title: "Project Orchestrator",
    subtitle: "¿Qué te gustaría hacer?",
    quickActions: "Acciones rápidas",
    selectProject: "Selecciona un proyecto arriba para usar las acciones rápidas",
    projectStatus: "Estado del proyecto",
    activePlanOne: "{count} plan activo",
    activePlanMany: "{count} planes activos",
    toReview: "{count} por revisar",
    allClear: "Todo en orden",
    notesOne: "{count} nota",
    notesMany: "{count} notas",
    synced: "Sincronizado {when}",
    untitled: "Sin título",
    untitledConversation: "Conversación sin título",
    recent: "Conversaciones recientes",
    actions: {
      next: {
        label: "Siguiente tarea",
        description: "Obtener la siguiente tarea disponible",
        prompt: "¿Cuál es la siguiente tarea disponible del plan activo? Muéstrame su contexto y sus pasos."
      },
      plan: {
        label: "Planificar algo",
        description: "Planificar una implementación",
        prompt: "Planifica la implementación de: "
      },
      impact: {
        label: "Análisis de impacto",
        description: "Analizar el impacto de un cambio",
        prompt: "Analiza el impacto de cambiar: "
      },
      arch: {
        label: "Arquitectura",
        description: "Resumen del código",
        prompt: "Dame un resumen de la arquitectura del proyecto"
      },
      search: {
        label: "Búsqueda de código",
        description: "Buscar en el código",
        prompt: "Busca en el código: "
      },
      roadmap: {
        label: "Hoja de ruta",
        description: "Hitos y releases",
        prompt: "Muéstrame la hoja de ruta completa con hitos y releases"
      }
    },
    time: {
      now: "ahora mismo",
      minutes: "hace {count} min",
      hours: "hace {count} h",
      days: "hace {count} d",
      months: "hace {count} meses"
    },
    plan: {
      draft: "Borrador",
      approved: "Aprobado",
      in_progress: "En curso",
      completed: "Hecho",
      cancelled: "Cancelado"
    }
  },
  panel: {
    connected: "Conectado",
    reconnecting: "Reconectando…",
    disconnected: "Desconectado",
    connectionLost: "Conexión perdida",
    exportTitle: "Exportación del chat",
    newChatTitle: "Nuevo chat",
    chatTitle: "Chat",
    conversations: "Conversaciones",
    newConversation: "Nueva conversación",
    backToChat: "Volver al chat",
    sessions: "Sesiones",
    newChat: "Nuevo chat",
    assistantTree: "Árbol de asistentes",
    permissionSettings: "Ajustes de permisos",
    copied: "¡Copiado!",
    copyChat: "Copiar el chat como markdown",
    exitFullscreen: "Salir de pantalla completa",
    close: "Cerrar",
    backToParent: "Volver al padre",
    actions: "Acciones de la conversación",
    attach: "Vincular a un plan o una tarea…",
    hideTree: "Ocultar el árbol de asistentes",
    showTree: "Mostrar el árbol de asistentes",
    fullscreen: "Pantalla completa",
    noProjectsTitle: "Aún no hay proyectos",
    noProjectsBody: "Añade un proyecto a este espacio de trabajo para iniciar una conversación con Claude.",
    addProject: "Añadir un proyecto"
  }
} satisfies Translation<'chatA-messages'>
