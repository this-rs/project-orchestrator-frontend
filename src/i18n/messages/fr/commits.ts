import type { Translation } from '../../catalog.ts'

export default {
  title: 'Commits',
  empty: 'Aucun commit',
  copy: 'Copier le SHA {sha}',
  copied: '{sha} copié',
  files: {
    one: '{count} fichier',
    other: '{count} fichiers',
  },
  loadingFiles: 'Chargement des fichiers…',
  noFiles: 'Aucun détail de fichier disponible',
} satisfies Translation<'commits'>
