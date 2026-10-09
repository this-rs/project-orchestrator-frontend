import type { Translation } from '../../catalog.ts'

export default {
  summary: {
    waves: 'Wellen:',
    maxParallel: 'Max. parallel:',
    criticalPath: 'Kritischer Pfad:',
    tasks: 'Aufgaben:',
    conflicts: '{count} Konflikte',
    viewRunner: 'Runner anzeigen',
    resume: 'Plan fortsetzen',
    launch: 'Plan starten',
  },
  card: {
    hideSteps: 'Schritte von {title} ausblenden',
    showSteps: 'Schritte von {title} anzeigen',
    working: 'In Arbeit…',
    conflictOn: 'Konflikt bei: {files}',
    fileConflict: 'Dateikonflikt',
    stepsDone: '{done} von {total} Schritten erledigt',
    sharedFile: '{file} — mit einer anderen Aufgabe dieser Welle geteilt',
    loadingSteps: 'Schritte werden geladen…',
    verify: 'Prüfen: {text}',
    noSteps: 'Keine Schritte',
    openTask: 'Aufgabe öffnen',
  },
  column: {
    wave: 'Welle {number}',
    activeWave: 'Aktive Welle',
    split: 'geteilt',
    progress: 'Welle {number}: {done} von {total} Aufgaben erledigt',
  },
  none: 'Keine Wellen berechnet',
} satisfies Translation<'waves'>
