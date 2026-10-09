import type { Translation } from '../../catalog.ts'

export default {
  title: 'Commits',
  empty: 'Nenhum commit',
  copy: 'Copiar SHA {sha}',
  copied: '{sha} copiado',
  files: {
    one: '{count} arquivo',
    other: '{count} arquivos',
  },
  loadingFiles: 'Carregando arquivos…',
  noFiles: 'Nenhum detalhe de arquivo disponível',
} satisfies Translation<'commits'>
