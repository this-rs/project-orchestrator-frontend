import type { Translation } from '../../catalog.ts'

export default {
  summary: {
    waves: 'वेव:',
    maxParallel: 'अधिकतम समानांतर:',
    criticalPath: 'क्रिटिकल पाथ:',
    tasks: 'कार्य:',
    conflicts: '{count} टकराव',
    viewRunner: 'रनर देखें',
    resume: 'योजना फिर शुरू करें',
    launch: 'योजना शुरू करें',
  },
  card: {
    hideSteps: '{title} के चरण छिपाएँ',
    showSteps: '{title} के चरण दिखाएँ',
    working: 'काम जारी है…',
    conflictOn: 'टकराव: {files}',
    fileConflict: 'फ़ाइल टकराव',
    stepsDone: '{total} में से {done} चरण पूर्ण',
    sharedFile: '{file} — इस वेव के किसी अन्य कार्य के साथ साझा',
    loadingSteps: 'चरण लोड हो रहे हैं…',
    verify: 'जाँचें: {text}',
    noSteps: 'कोई चरण नहीं',
    openTask: 'कार्य खोलें',
  },
  column: {
    wave: 'वेव {number}',
    activeWave: 'सक्रिय वेव',
    split: 'विभाजित',
    progress: 'वेव {number}: {total} में से {done} कार्य पूर्ण',
  },
  none: 'कोई वेव नहीं निकला',
} satisfies Translation<'waves'>
