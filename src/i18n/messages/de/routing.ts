import type { Translation } from '../../catalog.ts'

export default {
  modes: {
    primary: { label: 'Nur Primär', description: 'Ein einziger exklusiver Primär-Provider, wie heute. PO hält nur fest, was es gewählt hätte.' },
    mixed: { label: 'Gemischt', description: 'Der Primär-Provider führt das Gespräch; PO verteilt die Ausführenden.' },
    full: { label: 'Voll', description: 'PO wählt alles und erklärt, warum.' },
  },
  stages: {
    shadow: { label: 'Beobachtung', description: 'Nichts wird angewendet; jede Entscheidung wird aufgezeichnet.' },
    advisory: { label: 'Beratung', description: 'PO schlägt vor; Sie bestätigen.' },
    auto: { label: 'Automatisch', description: 'PO wendet seine Entscheidungen an.' },
  },
  routedBy: {
    session: 'Für die Sitzung gewählt',
    request: 'In der Anfrage gewählt',
    task: 'Von der Aufgabe gewählt',
    persona: 'Von der Persona gewählt',
    run: 'Vom Lauf gewählt',
    project_rule: 'Projektregel',
    global_rule: 'Globale Regel',
    default: 'Serverstandard',
    claude_code: 'Claude-Code-Rückfall',
    fallback: 'Rückfallkette',
    auto: 'PO hat gewählt',
  },
  rejection: {
    not_allowed: 'Für dieses Projekt nicht erlaubt',
    unhealthy: 'Nicht erreichbar',
    no_tools: 'Kann keine Werkzeuge aufrufen',
    context_too_small: 'Kontextfenster zu klein',
    no_images: 'Kann keine Bilder lesen',
    over_budget: 'Budget überschritten',
    trust_without_sandbox: 'Vertrauensmodus ohne Sandbox',
    remote: 'Remote, hier nicht erlaubt',
  },
  badge: { poChooses: 'PO wählt', why: 'Warum?' },
  advanced: { force: 'Erweitert: Provider/Modell für dieses Gespräch erzwingen' },
  picker: { primary: 'Primär: {target} · PO routet die Ausführenden', forced: 'Erzwungen: {target}', willChoose: 'PO wählt bei der ersten Nachricht', routedBy: 'Geroutet durch: {by}', aria: 'Routing-Modus: {mode}' },
  reason: 'Grund: {reason}',
  settings: { title: 'Routing', confirmAuto: 'PO wendet seine eigenen Entscheidungen künftig ohne Rückfrage an. Fortfahren?' },
  report: { agreement: 'Übereinstimmung mit der tatsächlichen Wahl', costDelta: 'Geschätzte Kostendifferenz', unknown: 'Unbekannt' },
} satisfies Translation<'routing'>
