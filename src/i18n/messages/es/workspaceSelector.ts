import type { Translation } from '../../catalog.ts'

export default {
  title: "Elige un espacio de trabajo",
  lead: "Un espacio de trabajo agrupa los proyectos que comparten un contexto y unos objetivos. Elige en cuál trabajar.",
  notFound: "No se encontró el espacio de trabajo «{slug}»",
  notFoundBody: "Puede que se haya eliminado o renombrado. Elige otro a continuación.",
  loading: "Cargando espacios de trabajo",
  errorTitle: "Error de conexión",
  errorBody: "No se pudieron cargar los espacios de trabajo. ¿Está en marcha el backend?",
  create: "Crear un espacio de trabajo",
  createSubmit: "Crear",
  creating: "Creando…",
  cancel: "Cancelar",
  nameLabel: "Nombre del espacio de trabajo",
  namePlaceholder: "Mi espacio de trabajo",
  welcome: "Te damos la bienvenida a Project Orchestrator",
  welcomeLead: "Crea tu primer espacio de trabajo para empezar.",
  createFirst: "Crear espacio de trabajo",
  createFailed: "No se pudo crear el espacio de trabajo",
  updated: "actualizado",
  explain: {
    what: "Un espacio de trabajo agrupa varios de tus proyectos que comparten un contexto y unos objetivos.",
    why: "Abres un espacio de trabajo y ves juntos sus proyectos, planes, notas y decisiones, y Hoy muestra lo que te espera en todos ellos.",
    different: "En lugar de una carpeta por proyecto sin nada en medio, los proyectos de un espacio de trabajo comparten lo decidido, así que un asistente que trabaja en uno sabe lo que resolvieron los demás.",
  },
} satisfies Translation<'workspaceSelector'>
