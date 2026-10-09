import type { Translation } from '../../catalog.ts'

export default {
  componentTypes: {
    service: 'सर्विस',
    frontend: 'फ़्रंटएंड',
    worker: 'वर्कर',
    database: 'डेटाबेस',
    message_queue: 'क्यू',
    cache: 'कैश',
    gateway: 'गेटवे',
    external: 'बाहरी',
    library: 'लाइब्रेरी',
    cli: 'CLI',
    other: 'अन्य',
  },
  tiers: {
    entry: 'प्रवेश बिंदु',
    gateway: 'गेटवे',
    services: 'सर्विसेज़',
    libraries: 'लाइब्रेरी, मैसेजिंग और कैश',
    data: 'डेटा और बाहरी',
    other: 'अन्य',
  },
  legend: {
    required: 'आवश्यक',
    optional: 'वैकल्पिक — इसके बिना भी सिस्टम चलता है',
    direction: 'बाएँ से दाएँ: जहाँ लोग प्रवेश करते हैं → सर्विसेज़ → डेटा',
    select: 'किसी कॉम्पोनेंट को चुनें और देखें कि उसके बंद होने पर क्या ठप होगा',
  },
  panel: {
    details: '{name} का विवरण',
    close: 'विवरण बंद करें',
    optional: 'वैकल्पिक',
    dependedOnBy: 'इन पर निर्भर ({n})',
    dependsOn: 'इन पर निर्भर करता है ({n})',
    nothingDependsOnThis: 'कोई भी इस पर निर्भर नहीं है।',
    dependsOnNothing: 'यह किसी पर निर्भर नहीं है।',
    derivedFrom: '{source} से प्राप्त',
  },
  description: 'बना हुआ सिस्टम: कॉम्पोनेंट और कौन किस पर निर्भर है।',
  loadFailed: 'आर्किटेक्चर लोड नहीं हो सका',
  emptyTitle: 'अभी कोई आर्किटेक्चर नहीं है',
  emptyDescription:
    'वर्कस्पेस में कॉम्पोनेंट (सर्विस, डेटाबेस, क्यू…) जोड़ें, या किसी असिस्टेंट से सिस्टम का नक्शा बनवाएँ।',
  graphLabel: 'आर्किटेक्चर ग्राफ़',
  outline: 'आर्किटेक्चर रूपरेखा',
} satisfies Translation<'architecture'>
