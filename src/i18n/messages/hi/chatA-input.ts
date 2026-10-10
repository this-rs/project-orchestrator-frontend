import type { Translation } from '../../catalog.ts'

export default {
  ask: {
    answered: "उत्तर दिया:",
    placeholder: "या अपना उत्तर लिखें...",
    submit: "जमा करें",
    notSent: "भेजा नहीं गया: कनेक्शन टूट गया। आपका उत्तर सुरक्षित है, दोबारा जुड़ने पर फिर कोशिश करें।"
  },
  attachments: {
    processing: "प्रोसेस हो रहा है…",
    remove: "हटाएँ",
    removeAria: "{name} हटाएँ",
    pendingSend: "अपलोड पूरा होने पर संदेश भेजा जाएगा"
  },
  upload: {
    network: "नेटवर्क त्रुटि — फ़ाइल सर्वर तक पहुँची ही नहीं",
    timeout: "सर्वर ने समय पर उत्तर नहीं दिया — फ़ाइल हटाकर दोबारा जोड़ें",
    tooLarge: "फ़ाइल बहुत बड़ी है",
    unsupported: "असमर्थित फ़ाइल फ़ॉर्मेट",
    unreadable: "फ़ाइल पढ़ी नहीं जा सकी (बिगड़ी हुई या क्षतिग्रस्त)",
    forbidden: "यहाँ अपलोड की अनुमति नहीं है",
    failed: "अपलोड विफल (HTTP {status})"
  },
  action: {
    send: "संदेश भेजें",
    stop: "जनरेशन रोकें",
    stopping: "रोका जा रहा है…",
    waiting: "अटैचमेंट का अपलोड पूरा होने की प्रतीक्षा है",
    idle: "संदेश भेजें",
    removeFailed: "पहले विफल अटैचमेंट हटाएँ",
    waitingUpload: "अपलोड पूरा होने की प्रतीक्षा है"
  },
  composer: {
    imageName: "छवि",
    alreadyIn: "{label} पहले से संदेश में है।",
    added: "{label} संदेश में जोड़ दिया गया।",
    close: "बंद करें",
    maxRefs: "प्रति संदेश अधिकतम {max} संदर्भ: आख़िरी जोड़ा नहीं गया।",
    references: "संदर्भ",
    placeholder: "संदेश भेजें...",
    attach: "फ़ाइल अटैच करें",
    override: "(ओवरराइड)",
    default: "डिफ़ॉल्ट",
    auto: "ऑटो",
    autoOn: "ऑटो-कंटिन्यू चालू है",
    autoOff: "ऑटो-कंटिन्यू बंद है",
    drop: "अटैच करने के लिए छोड़ें"
  }
} satisfies Translation<'chatA-input'>
