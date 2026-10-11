import type { Translation } from '../../catalog.ts'

export default {
  ask: {
    answered: "Respondido:",
    placeholder: "O escribe tu respuesta...",
    submit: "Enviar",
    notSent: "No enviado: conexión perdida. Tu respuesta se conserva; inténtalo de nuevo cuando te reconectes."
  },
  attachments: {
    processing: "Procesando…",
    remove: "Quitar",
    removeAria: "Quitar {name}",
    pendingSend: "El mensaje se enviará cuando termine la subida"
  },
  upload: {
    network: "Error de red — el archivo nunca llegó al servidor",
    timeout: "El servidor no respondió a tiempo — quita el archivo y vuelve a añadirlo",
    tooLarge: "Archivo demasiado grande",
    unsupported: "Formato de archivo no compatible",
    unreadable: "No se pudo leer el archivo (mal formado o dañado)",
    forbidden: "No tienes permiso para subir aquí",
    failed: "Error al subir (HTTP {status})"
  },
  action: {
    send: "Enviar mensaje",
    stop: "Detener la generación",
    stopping: "Deteniendo…",
    waiting: "Esperando a que terminen de subirse los adjuntos",
    idle: "Enviar mensaje",
    removeFailed: "Quita primero el adjunto fallido",
    waitingUpload: "Esperando a que termine la subida"
  },
  composer: {
    imageName: "imagen",
    alreadyIn: "{label} ya está en el mensaje.",
    added: "{label} añadido al mensaje.",
    close: "Cerrar",
    maxRefs: "Máximo de {max} referencias por mensaje: la última no se añadió.",
    references: "Referencias",
    placeholder: "Enviar un mensaje...",
    attach: "Adjuntar un archivo",
    override: "(reemplazado)",
    default: "predeterminado",
    auto: "Auto",
    autoOn: "Continuación automática activada",
    autoOff: "Continuación automática desactivada",
    drop: "Suelta para adjuntar"
  },
  refs: {
    picker: {
      all: "Todo",
      filterByKind: "Filtrar por tipo",
      hintActors: "actores",
      hintSearch: "buscar",
      kindOnly: "Solo {kind}",
      resultsOne: "{count} resultado",
      resultsMany: "{count} resultados",
      noResults: "Sin resultados",
      searching: "Buscando…",
      noActors: "No hay actores disponibles en este servidor",
      needsProject: "Selecciona un proyecto para buscar personas y skills",
      close: "Cerrar referencias"
    }
  }
} satisfies Translation<'chatA-input'>
