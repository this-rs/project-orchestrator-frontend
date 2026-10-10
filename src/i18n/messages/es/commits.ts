import type { Translation } from '../../catalog.ts'

export default {
  title: 'Commits',
  empty: 'Sin commits',
  copy: 'Copiar SHA {sha}',
  copied: '{sha} copiado',
  files: {
    one: '{count} archivo',
    other: '{count} archivos',
  },
  loadingFiles: 'Cargando archivos…',
  noFiles: 'No hay detalles de archivos disponibles',
} satisfies Translation<'commits'>
