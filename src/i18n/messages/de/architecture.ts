import type { Translation } from '../../catalog.ts'

export default {
  componentTypes: {
    service: 'Dienst',
    frontend: 'Frontend',
    worker: 'Worker',
    database: 'Datenbank',
    message_queue: 'Warteschlange',
    cache: 'Cache',
    gateway: 'Gateway',
    external: 'Extern',
    library: 'Bibliothek',
    cli: 'CLI',
    other: 'Sonstiges',
  },
  tiers: {
    entry: 'Einstiegspunkte',
    gateway: 'Gateway',
    services: 'Dienste',
    libraries: 'Bibliotheken, Messaging & Cache',
    data: 'Daten & Extern',
    other: 'Sonstiges',
  },
  legend: {
    required: 'Erforderlich',
    optional: 'Optional — das System läuft auch ohne',
    direction: 'Von links nach rechts: Einstieg der Nutzer → Dienste → Daten',
    select: 'Wählen Sie eine Komponente, um zu sehen, was bei ihrem Ausfall betroffen wäre',
  },
  panel: {
    details: 'Details zu {name}',
    close: 'Details schließen',
    optional: 'optional',
    dependedOnBy: 'Wird benötigt von ({n})',
    dependsOn: 'Benötigt ({n})',
    nothingDependsOnThis: 'Nichts hängt hiervon ab.',
    dependsOnNothing: 'Hängt von nichts ab.',
    derivedFrom: 'Abgeleitet aus {source}',
  },
  description: 'Das System, wie es gebaut ist: Komponenten und ihre Abhängigkeiten.',
  loadFailed: 'Die Architektur konnte nicht geladen werden',
  emptyTitle: 'Noch keine Architektur',
  emptyDescription:
    'Fügen Sie dem Arbeitsbereich Komponenten (Dienste, Datenbanken, Warteschlangen …) hinzu oder bitten Sie einen Assistenten, das System zu erfassen.',
  graphLabel: 'Architekturgraph',
  outline: 'Architekturübersicht',
} satisfies Translation<'architecture'>
