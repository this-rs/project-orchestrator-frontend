import type { Translation } from '../../catalog.ts'

export default {
  back: "Volver",
  settings: {
    title: "Ajustes",
    description: "Ajustes de la aplicación de escritorio. Se aplican a todas las conversaciones con los asistentes.",
    chatTitle: "Chat e IA",
    chatDescription: "Modo de permisos, herramientas permitidas y denegadas, variables de entorno y la CLI de Claude Code que usan los asistentes.",
    updatesTitle: "Actualizaciones",
    updatesDescription: "Busca una nueva versión de la aplicación de escritorio e instálala.",
    providersNote: "Los proveedores (instancias, consentimiento por proyecto, roles y política de modelos) tienen su propia página:",
    providersLink: "Proveedores → /providers",
    explain: {
      what: "Los ajustes son las opciones de la propia aplicación de escritorio: cómo pueden actuar los asistentes en esta máquina y cómo se actualiza la aplicación.",
      why: "Decides una vez qué puede ejecutar un asistente, qué herramientas puede usar y en qué versión estás.",
      different: "Hoy estas opciones están repartidas entre archivos de configuración y banderas de terminal. Aquí son una sola pantalla, aplicada a todas las conversaciones.",
    },
  },
  providers: {
    title: "Proveedores",
    description: "Dónde se ejecutan tus conversaciones, qué puede enviar allí cada proyecto y qué modelo hace qué.",
    explain: {
      what: "Tu elección de IA: Claude Code viene integrado y puedes registrar otro proveedor y permitirlo proyecto por proyecto.",
      why: "Eliges el proveedor y el modelo de una conversación, y una clave nunca se escribe en un formulario: se queda en la bóveda.",
      different: "Hoy una herramienta significa un modelo. Aquí una conversación se queda en su proveedor, y el asistente que delega una tarea puede nombrar el proveedor y el modelo para ella.",
    },
  },
} satisfies Translation<'settingsPage'>
