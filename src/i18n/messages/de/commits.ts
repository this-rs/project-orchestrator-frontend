import type { Translation } from '../../catalog.ts'

export default {
  title: 'Commits',
  empty: 'Keine Commits',
  copy: 'SHA {sha} kopieren',
  copied: '{sha} kopiert',
  files: {
    one: '{count} Datei',
    other: '{count} Dateien',
  },
  loadingFiles: 'Dateien werden geladen…',
  noFiles: 'Keine Dateidetails verfügbar',
} satisfies Translation<'commits'>
