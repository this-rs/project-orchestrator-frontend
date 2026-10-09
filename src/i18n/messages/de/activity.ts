import type { Translation } from '../../catalog.ts'

export default {
  status: {
    running: 'Läuft',
    queued: 'In Warteschlange',
    done: 'Erledigt',
    failed: 'Fehlgeschlagen',
    cancelled: 'Abgebrochen',
    ended: 'Beendet',
  },
  lifecycle: {
    started: 'Gestartet',
    progress: 'Fortschritt',
    updated: 'Aktualisiert',
    finished: 'Abgeschlossen',
  },
  param: {
    agent: 'Agent',
    workflow: 'Workflow',
    task: 'Aufgabe',
    tool: 'Tool',
    model: 'Modell',
    exitCode: 'Exit-Code',
    taskId: 'Aufgaben-ID',
    outputFile: 'Ausgabedatei',
  },
  title: {
    workflow: 'Workflow',
    shell: 'Hintergrundbefehl',
    monitor: 'Monitor',
    agent: 'Unter-Agent',
  },
} satisfies Translation<'activity'>
