import type { Translation } from '../../catalog.ts'

export default {
  modes: {
    primary: { label: 'Solo principal', description: 'Un único proveedor principal exclusivo, como hoy. PO solo registra lo que habría elegido.' },
    mixed: { label: 'Mixto', description: 'El principal dirige la conversación; PO enruta a los ejecutores.' },
    full: { label: 'Completo', description: 'PO elige todo y explica por qué.' },
  },
  stages: {
    shadow: { label: 'Sombra', description: 'No se aplica nada; cada decisión queda registrada.' },
    advisory: { label: 'Consejo', description: 'PO sugiere; tú confirmas.' },
    auto: { label: 'Automático', description: 'PO aplica sus decisiones.' },
  },
  routedBy: {
    session: 'Elegido para la sesión',
    request: 'Elegido en la solicitud',
    task: 'Elegido por la tarea',
    persona: 'Elegido por la persona',
    run: 'Elegido por la ejecución',
    project_rule: 'Regla del proyecto',
    global_rule: 'Regla global',
    default: 'Valor por defecto del servidor',
    claude_code: 'Respaldo de Claude Code',
    fallback: 'Cadena de respaldo',
    auto: 'PO eligió',
  },
  rejection: {
    not_allowed: 'No permitido para este proyecto',
    unhealthy: 'No disponible',
    no_tools: 'No puede llamar a herramientas',
    context_too_small: 'Ventana de contexto demasiado pequeña',
    no_images: 'No lee imágenes',
    over_budget: 'Presupuesto superado',
    trust_without_sandbox: 'Modo de confianza sin sandbox',
    remote: 'Remoto, no permitido aquí',
  },
  badge: { poChooses: 'PO elige', why: '¿Por qué?' },
  advanced: { force: 'Avanzado: forzar un proveedor/modelo para esta conversación' },
  picker: { primary: 'Principal: {target} · PO enruta a los ejecutores', forced: 'Forzado: {target}', willChoose: 'PO elegirá en el primer mensaje', routedBy: 'Enrutado por: {by}', aria: 'Enrutamiento: {mode}' },
  reason: 'Motivo: {reason}',
  settings: { title: 'Enrutamiento', confirmAuto: 'PO aplicará ahora sus propias decisiones sin preguntar. ¿Continuar?' },
  report: { agreement: 'Coincidencia con la elección real', costDelta: 'Diferencia de coste estimada', unknown: 'Desconocido' },
} satisfies Translation<'routing'>
