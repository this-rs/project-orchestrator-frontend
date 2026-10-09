import type { Translation } from '../../catalog.ts'

export default {
  neutral: {
    trust: "Rock'n roll",
    auto_edits: "संपादन अपने आप स्वीकारें",
    ask: "पूछें",
    plan_only: "केवल योजना",
  },
  composer: {
    trust: "Rock'n roll",
    auto_edits: "संपादन स्वीकारें",
    ask: "डिफ़ॉल्ट",
    plan_only: "केवल योजना",
  },
  session: {
    trust: "Rock'n roll",
    auto_edits: "संपादन स्वीकारें",
    ask: "अनुमति पूछें",
    plan_only: "योजना मोड",
  },
  native: {
    auto: { short: "ऑटो", long: "ऑटो मोड" },
    dontAsk: { short: "न पूछें", long: "न पूछें" },
  },
  settings: {
    claude: {
      trust: { label: "Rock'n roll", description: "सभी टूल अपने आप स्वीकृत। कोई पूछताछ नहीं।" },
      auto_edits: { label: "संपादन स्वीकारें", description: "फ़ाइल संपादन अपने आप स्वीकृत, कमांड पर पूछा जाएगा।" },
      ask: { label: "डिफ़ॉल्ट", description: "हर टूल के उपयोग पर पूछा जाएगा।" },
      plan_only: { label: "केवल योजना", description: "केवल पढ़ने का मोड। कोई लेखन या कमांड नहीं।" },
    },
    neutral: {
      trust: { description: "हर टूल बिना पूछे चलाएँ।" },
      auto_edits: { description: "फ़ाइल संपादन बिना पूछे चलते हैं; कमांड पर अब भी पूछा जाता है।" },
      ask: { description: "हर टूल कॉल से पहले पूछें।" },
      plan_only: { description: "केवल पढ़ने के लिए। कोई लेखन या कमांड नहीं।" },
    },
  },
  setup: {
    trust: {
      label: "Rock'n roll",
      description: "सभी टूल अपने आप स्वीकृत — कोई अनुमति नहीं पूछी जाती",
      summary: "Rock'n roll (सब अपने आप स्वीकृत)",
    },
    ask: {
      label: "डिफ़ॉल्ट",
      description: "फ़ाइल संपादन और शेल कमांड के लिए स्वीकृति पूछता है",
      summary: "डिफ़ॉल्ट (संपादन और शेल पर पूछें)",
    },
    auto_edits: {
      label: "संपादन स्वीकारें",
      description: "फ़ाइल संपादन अपने आप स्वीकृत, शेल कमांड के लिए स्वीकृति चाहिए",
      summary: "संपादन स्वीकारें (केवल शेल पर पूछें)",
    },
    plan_only: {
      label: "केवल योजना",
      description: "केवल पढ़ने का मोड — Claude फ़ाइलें पढ़ सकता है पर बदल नहीं सकता",
      summary: "केवल योजना (केवल पढ़ना)",
    },
  },
  trustRequiresSandbox: "उपलब्ध नहीं: यह रिमोट मशीन इस मोड की अनुमति नहीं देती। इसके टूल बिना पुष्टि चलाने के लिए इंस्टेंस की सेटिंग्स में इसे चालू करें।",
  rulesUnsupported: "अनुमति और निषेध के नियम Claude Code के लिए विशिष्ट हैं। यह प्रदाता उन्हें लागू नहीं करता, इसलिए वे दिखाए नहीं जाते: इसके टूल ऊपर चुने अनुमति मोड से चलते हैं।",
  trustDowngraded: "“Rock’n roll” मोड को “पूछें” से बदल दिया गया: यह रिमोट मशीन इसकी अनुमति नहीं देती।",
} satisfies Translation<'toolPolicy'>
