import type { Translation } from '../../catalog.ts'

export default {
  copy: {
    title: "मार्कडाउन के रूप में कॉपी करें",
    copied: "कॉपी हो गया!",
    popupTitle: "संदेश का मार्कडाउन"
  },
  compact: {
    label: "संदर्भ संक्षिप्त किया गया",
    trigger: {
      auto: "ऑटो",
      manual: "मैनुअल"
    },
    tokens: "~{count}K टोकन"
  },
  continued: {
    label: "जारी रखा गया",
    afterOne: "{count} टर्न बाद",
    afterMany: "{count} टर्न बाद"
  },
  bubble: {
    references: "संदर्भ",
    attachments: "अटैचमेंट",
    openAttachment: "{name} खोलें",
    copyMessage: "संदेश को मार्कडाउन के रूप में कॉपी करें",
    copyReply: "उत्तर को मार्कडाउन के रूप में कॉपी करें",
    thinking: "सोच रहा है..."
  },
  list: {
    loading: "संदेश लोड हो रहे हैं...",
    loadingOlder: "पुराने संदेश लोड हो रहे हैं...",
    beginning: "— बातचीत की शुरुआत —",
    loadingNewer: "नए संदेश लोड हो रहे हैं...",
    scrollMore: "— और देखने के लिए नीचे स्क्रॉल करें —",
    catchingUp: "पकड़ बना रहा है…",
    newActivity: "नई गतिविधि ↓"
  },
  compaction: {
    label: "संदर्भ संक्षिप्त हो रहा है"
  },
  spawn: {
    runner: "रनर",
    conversation: "उपजी",
    delegation: "सौंपी गई",
    pipeline: "पाइपलाइन",
    gate: "गेट",
    trigger: "ट्रिगर",
    mirrorClaudeCode: "उप-एजेंट (Claude Code)",
    subagentOf: "किसी अन्य बातचीत का उप-एजेंट"
  },
  welcome: {
    title: "Project Orchestrator",
    subtitle: "आप क्या करना चाहेंगे?",
    quickActions: "त्वरित कार्रवाइयाँ",
    selectProject: "त्वरित कार्रवाइयाँ उपयोग करने के लिए ऊपर प्रोजेक्ट चुनें",
    projectStatus: "प्रोजेक्ट की स्थिति",
    activePlanOne: "{count} सक्रिय प्लान",
    activePlanMany: "{count} सक्रिय प्लान",
    toReview: "{count} समीक्षा के लिए",
    allClear: "सब ठीक है",
    notesOne: "{count} नोट",
    notesMany: "{count} नोट",
    synced: "{when} सिंक हुआ",
    untitled: "शीर्षकहीन",
    untitledConversation: "शीर्षकहीन बातचीत",
    recent: "हाल की बातचीत",
    actions: {
      next: {
        label: "अगला टास्क",
        description: "अगला उपलब्ध टास्क पाएँ",
        prompt: "सक्रिय प्लान का अगला उपलब्ध टास्क कौन-सा है? मुझे उसका संदर्भ और चरण दिखाओ।"
      },
      plan: {
        label: "कुछ प्लान करें",
        description: "कार्यान्वयन प्लान करें",
        prompt: "इसके कार्यान्वयन की योजना बनाओ: "
      },
      impact: {
        label: "प्रभाव विश्लेषण",
        description: "बदलाव का प्रभाव जाँचें",
        prompt: "इसे बदलने के प्रभाव का विश्लेषण करो: "
      },
      arch: {
        label: "आर्किटेक्चर",
        description: "कोडबेस का अवलोकन",
        prompt: "मुझे प्रोजेक्ट के आर्किटेक्चर का अवलोकन दो"
      },
      search: {
        label: "कोड खोज",
        description: "कोडबेस में खोजें",
        prompt: "कोड में यह खोजो: "
      },
      roadmap: {
        label: "रोडमैप",
        description: "माइलस्टोन और रिलीज़",
        prompt: "मुझे माइलस्टोन और रिलीज़ के साथ पूरा रोडमैप दिखाओ"
      },
      prepare: {
        label: "कुछ तैयार करें",
        description: "एक आयोजन, एक फ़ाइल, एक लॉन्च",
        prompt: "निम्नलिखित को कार्यों की योजना के रूप में तैयार करने में मेरी मदद करें, जिसमें क्या किस पर निर्भर है: "
      },
      track: {
        label: "किसी चीज़ पर नज़र रखें",
        description: "एक बजट, एक समय-सारणी, एक सूची",
        prompt: "निम्नलिखित पर नज़र रखने का तरीका बनाएँ: कार्यों वाली योजना, जो मैं कहूँ उसके नोट्स, और हर बार चुनने पर एक निर्णय। यह है जिस पर नज़र रखनी है: "
      },
      resume: {
        label: "जो रुका है उसे फिर से शुरू करें",
        description: "प्रतीक्षारत कार्य फिर से शुरू करें",
        prompt: "क्या रुका है या मेरा इंतज़ार कर रहा है? इसे सूचीबद्ध करें, फिर पहला आइटम फिर से शुरू करें।"
      },
      decided: {
        label: "हमने क्या तय किया?",
        description: "निर्णय और उनके कारण",
        prompt: "अब तक हमने क्या और क्यों तय किया? निर्णयों को उनके कारणों और छोड़े गए विकल्पों के साथ सूचीबद्ध करें।"
      },
      standing: {
        label: "हम कहाँ खड़े हैं?",
        description: "लक्ष्य, योजनाएँ, प्रगति",
        prompt: "मुझे दिखाएँ कि हम कहाँ हैं: लक्ष्य, योजनाएँ, क्या हो गया और आगे क्या है।"
      }
    },
    time: {
      now: "अभी",
      minutes: "{count} मिनट पहले",
      hours: "{count} घंटे पहले",
      days: "{count} दिन पहले",
      months: "{count} महीने पहले"
    },
    plan: {
      draft: "ड्राफ़्ट",
      approved: "स्वीकृत",
      in_progress: "प्रगति में",
      completed: "पूर्ण",
      cancelled: "रद्द"
    }
  },
  panel: {
    connected: "जुड़ा हुआ",
    reconnecting: "फिर से जुड़ रहा है…",
    disconnected: "डिस्कनेक्ट",
    connectionLost: "कनेक्शन टूट गया",
    exportTitle: "चैट एक्सपोर्ट",
    newChatTitle: "नई चैट",
    chatTitle: "चैट",
    conversations: "बातचीतें",
    newConversation: "नई बातचीत",
    backToChat: "चैट पर वापस जाएँ",
    sessions: "सेशन",
    newChat: "नई चैट",
    assistantTree: "असिस्टेंट ट्री",
    permissionSettings: "अनुमति सेटिंग्स",
    copied: "कॉपी हो गया!",
    copyChat: "चैट को मार्कडाउन के रूप में कॉपी करें",
    exitFullscreen: "फ़ुलस्क्रीन से बाहर निकलें",
    close: "बंद करें",
    backToParent: "पैरेंट पर वापस जाएँ",
    mirrorBanner: "Claude Code उप-एजेंट की केवल-पढ़ने वाली प्रतिलिपि",
    actions: "बातचीत की कार्रवाइयाँ",
    attach: "प्लान या टास्क से जोड़ें…",
    hideTree: "असिस्टेंट ट्री छिपाएँ",
    showTree: "असिस्टेंट ट्री दिखाएँ",
    fullscreen: "फ़ुलस्क्रीन",
    noProjectsTitle: "अभी कोई प्रोजेक्ट नहीं",
    noProjectsBody: "Claude के साथ बातचीत शुरू करने के लिए इस वर्कस्पेस में एक प्रोजेक्ट जोड़ें।",
    addProject: "प्रोजेक्ट जोड़ें"
  },
  attachment: {
    download: "डाउनलोड करें",
    noPreview: "यह फ़ॉर्मैट यहाँ नहीं दिखाया जा सकता — फ़ाइल डाउनलोड की जा सकती है।",
    noText: "इस फ़ाइल से कोई टेक्स्ट नहीं निकाला जा सका — इसे डाउनलोड किया जा सकता है।",
    loadFailed: "फ़ाइल पढ़ी नहीं जा सकी।",
    truncated: "पूर्वावलोकन पहले {chars} अक्षरों तक सीमित है — बाकी के लिए फ़ाइल डाउनलोड करें।",
  },
} satisfies Translation<'chatA-messages'>
