import type { Translation } from '../../catalog.ts'

export default {
  modes: {
    primary: { label: 'केवल प्राथमिक', description: 'केवल एक विशिष्ट प्राथमिक प्रदाता, जैसा आज है। PO केवल दर्ज करता है कि वह क्या चुनता।' },
    mixed: { label: 'मिश्रित', description: 'प्राथमिक प्रदाता बातचीत चलाता है; PO निष्पादकों को रूट करता है।' },
    full: { label: 'पूर्ण', description: 'PO सब कुछ चुनता है और कारण बताता है।' },
  },
  stages: {
    shadow: { label: 'शैडो', description: 'कुछ लागू नहीं होता; हर निर्णय दर्ज होता है।' },
    advisory: { label: 'सलाहकार', description: 'PO सुझाव देता है; आप पुष्टि करते हैं।' },
    auto: { label: 'स्वचालित', description: 'PO अपने निर्णय लागू करता है।' },
  },
  routedBy: {
    session: 'सत्र के लिए चुना गया',
    request: 'अनुरोध में चुना गया',
    task: 'कार्य द्वारा चुना गया',
    persona: 'पर्सोना द्वारा चुना गया',
    run: 'रन द्वारा चुना गया',
    project_rule: 'प्रोजेक्ट नियम',
    global_rule: 'वैश्विक नियम',
    default: 'सर्वर डिफ़ॉल्ट',
    claude_code: 'Claude Code विकल्प',
    fallback: 'वैकल्पिक श्रृंखला',
    auto: 'PO ने चुना',
  },
  rejection: {
    not_allowed: 'इस प्रोजेक्ट के लिए अनुमत नहीं',
    unhealthy: 'अस्वस्थ',
    no_tools: 'टूल नहीं बुला सकता',
    context_too_small: 'संदर्भ विंडो बहुत छोटी है',
    no_images: 'चित्र नहीं पढ़ सकता',
    over_budget: 'बजट से अधिक',
    trust_without_sandbox: 'बिना सैंडबॉक्स का विश्वास मोड',
    remote: 'रिमोट, यहाँ अनुमत नहीं',
  },
  badge: { poChooses: 'PO चुनता है', why: 'क्यों?' },
  advanced: { force: 'प्रदाता थोपें' },
  settings: { title: 'रूटिंग', confirmAuto: 'अब PO बिना पूछे अपने चुनाव लागू करेगा। जारी रखें?' },
  report: { agreement: 'वास्तविक चुनाव से मेल', costDelta: 'अनुमानित लागत अंतर', unknown: 'अज्ञात' },
} satisfies Translation<'routing'>
