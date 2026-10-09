import type { Translation } from '../../catalog.ts'

export default {
  summary: {
    waves: 'Olas:',
    maxParallel: 'Paralelismo máx.:',
    criticalPath: 'Ruta crítica:',
    tasks: 'Tareas:',
    conflicts: '{count} conflictos',
    viewRunner: 'Ver runner',
    resume: 'Reanudar plan',
    launch: 'Lanzar plan',
  },
  card: {
    hideSteps: 'Ocultar los pasos de {title}',
    showSteps: 'Mostrar los pasos de {title}',
    working: 'Trabajando…',
    conflictOn: 'Conflicto en: {files}',
    fileConflict: 'Conflicto de archivo',
    stepsDone: '{done} de {total} pasos completados',
    sharedFile: '{file} — compartido con otra tarea de esta ola',
    loadingSteps: 'Cargando pasos…',
    verify: 'Verificar: {text}',
    noSteps: 'Sin pasos',
    openTask: 'Abrir tarea',
  },
  column: {
    wave: 'Ola {number}',
    activeWave: 'Ola activa',
    split: 'dividida',
    progress: 'Ola {number}: {done} de {total} tareas completadas',
  },
  none: 'No se han calculado olas',
} satisfies Translation<'waves'>
