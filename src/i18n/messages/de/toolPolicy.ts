import type { Translation } from '../../catalog.ts'

export default {
  neutral: {
    trust: "Rock'n roll",
    auto_edits: 'Änderungen automatisch genehmigen',
    ask: 'Nachfragen',
    plan_only: 'Nur Plan',
  },
  composer: {
    trust: "Rock'n roll",
    auto_edits: 'Änderungen akzeptieren',
    ask: 'Standard',
    plan_only: 'Nur Plan',
  },
  session: {
    trust: "Rock'n roll",
    auto_edits: 'Änderungen akzeptieren',
    ask: 'Berechtigungen erfragen',
    plan_only: 'Planmodus',
  },
  native: {
    auto: { short: 'Auto', long: 'Automatikmodus' },
    dontAsk: { short: 'Nie fragen', long: 'Nicht nachfragen' },
  },
  settings: {
    claude: {
      trust: { label: "Rock'n roll", description: 'Alle Tools automatisch genehmigen. Keine Rückfragen.' },
      auto_edits: { label: 'Änderungen akzeptieren', description: 'Dateiänderungen automatisch genehmigen, bei Befehlen nachfragen.' },
      ask: { label: 'Standard', description: 'Bei jeder Tool-Nutzung nachfragen.' },
      plan_only: { label: 'Nur Plan', description: 'Schreibgeschützter Modus. Keine Schreibzugriffe oder Befehle.' },
    },
    neutral: {
      trust: { description: 'Jedes Tool ohne Nachfrage ausführen.' },
      auto_edits: { description: 'Dateiänderungen laufen ohne Nachfrage; bei Befehlen wird weiter nachgefragt.' },
      ask: { description: 'Vor jedem Tool-Aufruf nachfragen.' },
      plan_only: { description: 'Nur lesen. Keine Schreibzugriffe oder Befehle.' },
    },
  },
  setup: {
    trust: {
      label: "Rock'n roll",
      description: 'Alle Tools automatisch genehmigt — keine Berechtigungsabfragen',
      summary: "Rock'n roll (alles automatisch genehmigt)",
    },
    ask: {
      label: 'Standard',
      description: 'Fragt bei Dateiänderungen und Shell-Befehlen nach der Genehmigung',
      summary: 'Standard (Nachfrage bei Änderungen und Shell)',
    },
    auto_edits: {
      label: 'Änderungen akzeptieren',
      description: 'Dateiänderungen automatisch genehmigt, Shell-Befehle brauchen eine Genehmigung',
      summary: 'Änderungen akzeptieren (Nachfrage nur bei Shell)',
    },
    plan_only: {
      label: 'Nur Plan',
      description: 'Schreibgeschützter Modus — Claude kann Dateien lesen, aber nicht ändern',
      summary: 'Nur Plan (schreibgeschützt)',
    },
  },
  trustRequiresSandbox: 'Nicht verfügbar: Dieser entfernte Rechner erlaubt diesen Modus nicht. Aktivieren Sie ihn in den Instanzeinstellungen, um seine Tools ohne Bestätigung auszuführen.',
  rulesUnsupported: 'Erlauben- und Verweigern-Regeln gibt es nur in Claude Code. Dieser Anbieter wendet sie nicht an, deshalb werden sie nicht angezeigt: Über seine Tools entscheidet der oben gewählte Berechtigungsmodus.',
  trustDowngraded: 'Der Modus „Rock’n roll“ wurde durch „Nachfragen“ ersetzt: Dieser entfernte Rechner erlaubt ihn nicht.',
} satisfies Translation<'toolPolicy'>
