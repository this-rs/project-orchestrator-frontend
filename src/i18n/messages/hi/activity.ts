import type { Translation } from '../../catalog.ts'

export default {
  status: {
    running: 'चल रहा है',
    queued: 'कतार में',
    done: 'पूरा हुआ',
    failed: 'विफल',
    cancelled: 'रद्द',
    ended: 'समाप्त',
  },
  lifecycle: {
    started: 'शुरू हुआ',
    progress: 'प्रगति',
    updated: 'अद्यतन',
    finished: 'समाप्त',
  },
  param: {
    agent: 'एजेंट',
    workflow: 'कार्यप्रवाह',
    task: 'कार्य',
    tool: 'टूल',
    model: 'मॉडल',
    exitCode: 'निकास कोड',
    taskId: 'कार्य आईडी',
    outputFile: 'आउटपुट फ़ाइल',
  },
  title: {
    workflow: 'कार्यप्रवाह',
    shell: 'बैकग्राउंड कमांड',
    monitor: 'मॉनिटर',
    agent: 'उप-एजेंट',
  },
} satisfies Translation<'activity'>
