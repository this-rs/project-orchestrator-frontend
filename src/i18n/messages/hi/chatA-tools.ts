import type { Translation } from '../../catalog.ts'

export default {
  bash: {
    emptyCommand: "(खाली कमांड)",
    showLess: "कम दिखाएँ",
    showMore: "{count} और अक्षर दिखाएँ",
    noOutput: "कोई आउटपुट नहीं",
    running: "चल रहा है..."
  },
  default: {
    input: "इनपुट",
    error: "त्रुटि",
    result: "परिणाम",
    truncated: "... (छोटा किया गया)"
  },
  edit: {
    replaceAll: "सब बदलें",
    removedLineOne: "-{count} पंक्ति",
    removedLineMany: "-{count} पंक्तियाँ",
    addedLineOne: "+{count} पंक्ति",
    addedLineMany: "+{count} पंक्तियाँ",
    moreRemovedOne: "... {count} और हटाई गई पंक्ति",
    moreRemovedMany: "... {count} और हटाई गई पंक्तियाँ",
    moreAddedOne: "... {count} और जोड़ी गई पंक्ति",
    moreAddedMany: "... {count} और जोड़ी गई पंक्तियाँ",
    truncated: "... (छोटा किया गया)",
    editing: "संपादित हो रहा है..."
  },
  chat: {
    you: "आप",
    assistant: "असिस्टेंट",
    messageOne: "{count} संदेश",
    messageMany: "{count} संदेश"
  },
  code: {
    copyPath: "पाथ कॉपी करें",
    noResults: "कोई परिणाम नहीं",
    searchResults: "खोज परिणाम",
    noSymbols: "कोई सिंबल नहीं मिला",
    noReferences: "कोई संदर्भ नहीं मिला",
    unknownFile: "(अज्ञात)",
    references: "संदर्भ",
    calledBy: "इनके द्वारा कॉल किया गया",
    calls: "ये कॉल करता है",
    noCallGraph: "कॉल ग्राफ़ का कोई डेटा नहीं",
    callersColon: "कॉलर:",
    dependentFiles: "निर्भर फ़ाइलें",
    mostConnected: "सबसे अधिक जुड़ी फ़ाइलें",
    imports: "इम्पोर्ट",
    importedBy: "इनके द्वारा इम्पोर्ट किया गया",
    label: {
      results: "परिणाम",
      files: "फ़ाइलें",
      callers: "कॉलर",
      callees: "कॉल किए गए",
      imports: "इम्पोर्ट",
      dependents: "निर्भर"
    },
    cat: {
      functions: "फ़ंक्शन",
      structs: "स्ट्रक्ट",
      enums: "एनम",
      traits: "ट्रेट",
      impls: "impl",
      macros: "मैक्रो",
      constants: "स्थिरांक",
      type_aliases: "टाइप एलियास"
    },
    symbols: {
      implementations: "कार्यान्वयन",
      traits: "ट्रेट",
      impls: "impl ब्लॉक"
    },
    symbolsNone: {
      implementations: "कोई कार्यान्वयन नहीं मिला",
      traits: "कोई ट्रेट नहीं मिला",
      impls: "कोई impl ब्लॉक नहीं मिला"
    }
  },
  entity: {
    project: "प्रोजेक्ट",
    created: "बनाया गया",
    plan: "प्लान",
    path: "पाथ",
    synced: "सिंक किया गया",
    target: "लक्ष्य",
    verify: "सत्यापन",
    tasks: "टास्क",
    constraints: "बाधाएँ",
    criteria: "स्वीकृति मानदंड",
    steps: "चरण",
    decisions: "निर्णय",
    label: {
      tasks: "टास्क",
      constraints: "बाधाएँ",
      criteria: "मानदंड",
      steps: "चरण",
      decisions: "निर्णय"
    },
    type: {
      plan: "प्लान",
      task: "टास्क",
      project: "प्रोजेक्ट",
      milestone: "माइलस्टोन",
      workspace: "वर्कस्पेस",
      note: "नोट",
      release: "रिलीज़"
    },
    view: {
      entity: "{entity} देखें",
      parentTask: "पैरेंट टास्क देखें",
      parentPlan: "पैरेंट प्लान देखें",
      linkedTask: "जुड़ा हुआ टास्क देखें",
      linkedPlan: "जुड़ा हुआ प्लान देखें"
    },
    deleted: "हटाया गया",
    updated: "अपडेट किया गया",
    createdVerb: "बनाया गया",
    moreFields: "+{count} और फ़ील्ड"
  },
  list: {
    untitledPlan: "शीर्षकहीन प्लान",
    untitledSession: "शीर्षकहीन सेशन",
    msgOne: "{count} संदेश",
    msgMany: "{count} संदेश",
    energy: "ऊर्जा स्तर",
    target: "लक्ष्य: {date}",
    noResults: "कोई परिणाम नहीं",
    resultOne: "{count} परिणाम",
    resultMany: "{count} परिणाम",
    matching: "“{query}” से मेल खाते"
  },
  viz: {
    noRadar: "रडार का कोई डेटा उपलब्ध नहीं है।",
    unknownTarget: "अज्ञात",
    direct: "प्रत्यक्ष ({count})",
    transitive: "परोक्ष ({count})",
    total: "कुल {count}",
    importance: {
      critical: "गंभीर",
      high: "उच्च",
      medium: "मध्यम",
      low: "निम्न"
    },
    kind: {
      guideline: "दिशानिर्देश",
      gotcha: "पेचीदगी",
      pattern: "पैटर्न",
      context: "संदर्भ",
      tip: "सुझाव",
      observation: "अवलोकन",
      assertion: "दावा",
      decision: "निर्णय"
    }
  },
  permission: {
    actions: "इस अनुमति अनुरोध का उत्तर दें",
    allowOnce: "एक बार अनुमति दें",
    allowSession: "इस सत्र के लिए",
    deny: "अस्वीकार करें",
    sessionHint: "इस बातचीत में इसी कॉल के लिए फिर नहीं पूछा जाएगा",
    awaiting: "पुष्टि की प्रतीक्षा…",
    sessionCovers: "अनुमति मिलने पर «इस सत्र के लिए» केवल इस पर लागू होता है:",
    forbidden: "केवल वही व्यक्ति उत्तर दे सकता है जिसकी यह बातचीत है। कोई उत्तर नहीं भेजा गया।",
    ownerUnreadable: "यह जाँचा नहीं जा सका कि यह बातचीत किसकी है। कोई उत्तर नहीं भेजा गया: फिर से प्रयास करें।",
    unconfirmed: "कोई पुष्टि नहीं मिली। फिर से उत्तर दें।",
    scopeRefused: "यह अनुमति सत्र के लिए नहीं रखी जा सकती (कॉल कोई दूसरा कमांड चलाता है, या सत्र इसे नहीं देता)। एक बार अनुमति दें या अस्वीकार करें।",
    allowed: "अनुमति दी गई",
    allowedSession: "सत्र के लिए अनुमति दी गई",
    denied: "अस्वीकृत"
  }
} satisfies Translation<'chatA-tools'>
