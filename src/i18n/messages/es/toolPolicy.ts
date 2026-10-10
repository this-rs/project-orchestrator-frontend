import type { Translation } from '../../catalog.ts'

export default {
  neutral: {
    trust: "Rock'n roll",
    auto_edits: 'Aprobar ediciones automáticamente',
    ask: 'Preguntar',
    plan_only: 'Solo planificar',
  },
  composer: {
    trust: "Rock'n roll",
    auto_edits: 'Aceptar ediciones',
    ask: 'Predeterminado',
    plan_only: 'Solo planificar',
  },
  session: {
    trust: "Rock'n roll",
    auto_edits: 'Aceptar ediciones',
    ask: 'Pedir permisos',
    plan_only: 'Modo de planificación',
  },
  native: {
    auto: { short: 'Auto', long: 'Modo automático' },
    dontAsk: { short: 'No preguntar', long: 'No preguntar' },
  },
  settings: {
    claude: {
      trust: { label: "Rock'n roll", description: 'Aprueba todas las herramientas automáticamente. Sin avisos.' },
      auto_edits: { label: 'Aceptar ediciones', description: 'Aprueba las ediciones de archivos automáticamente y pregunta por los comandos.' },
      ask: { label: 'Predeterminado', description: 'Pregunta en cada uso de herramientas.' },
      plan_only: { label: 'Solo planificar', description: 'Modo de solo lectura. Sin escrituras ni comandos.' },
    },
    neutral: {
      trust: { description: 'Ejecuta todas las herramientas sin preguntar.' },
      auto_edits: { description: 'Las ediciones de archivos se ejecutan sin preguntar; los comandos siguen preguntando.' },
      ask: { description: 'Pregunta antes de cada llamada a una herramienta.' },
      plan_only: { description: 'Solo lectura. Sin escrituras ni comandos.' },
    },
  },
  setup: {
    trust: {
      label: "Rock'n roll",
      description: 'Todas las herramientas se aprueban automáticamente — sin avisos de permiso',
      summary: "Rock'n roll (todo aprobado automáticamente)",
    },
    ask: {
      label: 'Predeterminado',
      description: 'Pide aprobación para editar archivos y ejecutar comandos de shell',
      summary: 'Predeterminado (preguntar por ediciones y shell)',
    },
    auto_edits: {
      label: 'Aceptar ediciones',
      description: 'Las ediciones de archivos se aprueban automáticamente; los comandos de shell requieren aprobación',
      summary: 'Aceptar ediciones (preguntar solo por el shell)',
    },
    plan_only: {
      label: 'Solo planificar',
      description: 'Modo de solo lectura — Claude puede leer pero no modificar archivos',
      summary: 'Solo planificar (solo lectura)',
    },
  },
  trustRequiresSandbox: 'No disponible: esta máquina remota no permite este modo. Actívalo en los ajustes de la instancia para ejecutar sus herramientas sin confirmación.',
  rulesUnsupported: 'Las reglas de permitir y denegar son propias de Claude Code. Este proveedor no las aplica, por eso no se muestran: lo que gobierna sus herramientas es el modo de permisos de arriba.',
  trustDowngraded: 'El modo «Rock’n roll» se reemplazó por «Preguntar»: esta máquina remota no lo permite.',
} satisfies Translation<'toolPolicy'>
