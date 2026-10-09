import type { Translation } from '../../catalog.ts'

export default {
  kindName: {
    run: "रन",
    workflow: "वर्कफ़्लो",
    agent: "एजेंट",
    shell: "शेल",
    monitor: "मॉनिटर"
  },
  kindCount: {
    run: {
      one: "{count} रन",
      many: "{count} रन"
    },
    workflow: {
      one: "{count} वर्कफ़्लो",
      many: "{count} वर्कफ़्लो"
    },
    agent: {
      one: "{count} एजेंट",
      many: "{count} एजेंट"
    },
    shell: {
      one: "{count} शेल",
      many: "{count} शेल"
    },
    monitor: {
      one: "{count} मॉनिटर",
      many: "{count} मॉनिटर"
    }
  },
  row: {
    progress: "{settled}/{total} एजेंट",
    stopping: "रोका जा रहा है…",
    stoppingTitle: "रोका जा रहा है…",
    stop: "रोकें",
    stopAria: "{title} को रोकें",
    stopRun: "इस रन को रोकें",
    show: "बातचीत में दिखाएँ",
    showAria: "{title} को बातचीत में दिखाएँ",
    openConversation: "उसकी बातचीत खोलें",
    openConversationAria: "{title} की बातचीत खोलें",
    dashboard: "रनर डैशबोर्ड खोलें",
    dashboardAria: "{title} का रनर डैशबोर्ड खोलें"
  },
  bar: {
    tooFast: "रद्द करना बहुत तेज़ है — थोड़ी देर बाद फिर कोशिश करें।",
    cancelFailed: "टास्क रद्द नहीं हो सका — इसके बजाय ग्लोबल स्टॉप का उपयोग करें।",
    runningAria: "चल रहा है: {summary}",
    stoppedOne: "{count} सबप्रोसेस रोका गया।",
    stoppedMany: "{count} सबप्रोसेस रोके गए।",
    noPid: "रद्द करना दर्ज हो गया, पर सबप्रोसेस का PID ज्ञात नहीं था — यदि अपडेट आते रहें, तो ग्लोबल स्टॉप बटन का उपयोग करें।"
  },
  agent: {
    subAgent: "सब-एजेंट",
    toolOne: "{count} टूल",
    toolMany: "{count} टूल",
    running: "{count} चल रहे हैं",
    runningIndicator: "एजेंट चल रहा है..."
  },
  status: {
    spawning: "शुरू हो रहा है",
    running: "चल रहा है",
    verifying: "सत्यापित हो रहा है",
    completed: "पूर्ण",
    failed: "विफल",
    interrupted: "बाधित"
  },
  banner: {
    elapsed: "बीता समय",
    cost: "लागत",
    ram: "RAM (रेज़िडेंट)",
    cpu: "CPU",
    pidTitle: "PID {pid} · {threads} थ्रेड · {status}",
    viewAgent: "इस एजेंट की बातचीत देखें",
    view: "देखें",
    interrupt: "इस एजेंट को बाधित करें",
    runTitle: "रन {id}",
    runShort: "रन {id}",
    wave: "वेव {wave}",
    openDashboard: "पूरा रनर डैशबोर्ड खोलें",
    dashboard: "डैशबोर्ड",
    spawning: "एजेंट शुरू हो रहे हैं…",
    noAgents: "कोई सक्रिय एजेंट नहीं",
    title: "एजेंटिक मोड",
    activeOne: "{count} रन सक्रिय",
    activeMany: "{count} रन सक्रिय",
    cumulative: "कुल {cost}"
  },
  pill: {
    title: "एजेंटिक मोड",
    state: {
      idle: "निष्क्रिय",
      ready: "तैयार",
      running: "चल रहा है",
      completed: "पूर्ण"
    },
    workingOne: "एजेंटिक मोड — {count} एजेंट काम कर रहा है",
    workingMany: "एजेंटिक मोड — {count} एजेंट काम कर रहे हैं",
    completedOne: "एजेंटिक मोड — {count} रन पूरा हुआ",
    completedMany: "एजेंटिक मोड — {count} रन पूरे हुए",
    ready: "एजेंटिक मोड — तैयार",
    streamingOne: "अभी {count} रन स्ट्रीम हो रहा है। नीचे का बैनर एजेंटों को रीयल टाइम में दिखाता है।",
    streamingMany: "अभी {count} रन स्ट्रीम हो रहे हैं। नीचे का बैनर एजेंटों को रीयल टाइम में दिखाता है।",
    more: "+ {count} और",
    readyNote: "इस चैट से जुड़े प्लान हैं, पर अभी कोई स्ट्रीम नहीं हो रहा।",
    ranOne: "इस चैट से {count} रन चलाया गया। अभी कोई स्ट्रीम नहीं हो रहा।",
    ranMany: "इस चैट से {count} रन चलाए गए। अभी कोई स्ट्रीम नहीं हो रहा।",
    openDashboard: "रनर डैशबोर्ड खोलें"
  },
  bg: {
    title: "बैकग्राउंड गतिविधि",
    listAria: "बैकग्राउंड गतिविधियाँ",
    summary: {
      running: "{count} चल रहे हैं",
      queued: "{count} कतार में",
      failed: "{count} विफल",
      done: "{count} पूर्ण",
      cancelled: "{count} रद्द",
      ended: "{count} समाप्त"
    }
  },
  card: {
    showMore: "और दिखाएँ",
    showLess: "कम दिखाएँ",
    lineOne: "{count} पंक्ति",
    lineMany: "{count} पंक्तियाँ",
    earlierLineOne: "{count} पिछली पंक्ति दिखाएँ",
    earlierLineMany: "{count} पिछली पंक्तियाँ दिखाएँ",
    progressOf: "{title} की प्रगति",
    agents: "{settled}/{total} एजेंट",
    agentsOf: "{title} के एजेंट",
    tokens: "{count} टोकन",
    toolUseOne: "{count} टूल उपयोग",
    toolUseMany: "{count} टूल उपयोग",
    timeline: "टाइमलाइन",
    eventOne: "{count} इवेंट",
    eventMany: "{count} इवेंट",
    eventsOf: "{title} के इवेंट",
    hiddenEventOne: "… {count} पिछला इवेंट सहेजा नहीं गया",
    hiddenEventMany: "… {count} पिछले इवेंट सहेजे नहीं गए",
    rawPayload: "रॉ पेलोड",
    parameters: "पैरामीटर",
    latestOutput: "नवीनतम आउटपुट",
    output: "आउटपुट",
    kind: {
      workflow: "वर्कफ़्लो",
      shell: "बैकग्राउंड कमांड",
      monitor: "मॉनिटर",
      agent: "सब-एजेंट",
      generic: "बैकग्राउंड गतिविधि"
    },
    status: {
      running: "चल रहा है",
      queued: "कतार में",
      done: "पूर्ण",
      failed: "विफल",
      cancelled: "रद्द",
      ended: "समाप्त"
    }
  },
  runs: {
    finished: "समाप्त",
    view: "रन देखें",
    stop: "रन रोकें",
    loading: "निष्पादन लोड हो रहे हैं…",
    noDetails: "निष्पादन का कोई विवरण उपलब्ध नहीं है।",
    inProgressOne: "{count} रन जारी है",
    inProgressMany: "{count} रन जारी हैं",
    completedOne: "{count} रन पूरा हुआ",
    completedMany: "{count} रन पूरे हुए",
    done: "{count} पूर्ण"
  }
} satisfies Translation<'chatA-activity'>
