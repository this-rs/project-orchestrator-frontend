import type { Translation } from '../../catalog.ts'

export default {
  energy: {
    label: 'Energie',
    description: 'Aktuelles Aktivitätsniveau eines Elements. Je höher die Energie, desto aktiver wird daran gearbeitet.',
  },
  cohesion: {
    label: 'Kohäsion',
    description: 'Maß für den inneren Zusammenhalt eines Moduls oder einer Komponente. Hohe Kohäsion heißt, dass ihre Elemente eng miteinander verbunden sind.',
  },
  synapse: {
    label: 'Synapse',
    description: 'Verbindung zwischen zwei Elementen des Projekts (Notizen, Aufgaben, Dateien). Steht für eine Abhängigkeit oder einen inhaltlichen Zusammenhang.',
  },
  scar: {
    label: 'Narbe',
    description: 'Spur eines früheren Problems. Hilft, dieselben Fehler nicht zu wiederholen, indem sie anfällige Stellen markiert.',
  },
  moat: {
    label: 'Burggraben',
    description: 'Schutzwall um eine kritische Komponente. Zeigt an, dass Änderungen dort besondere Sorgfalt verlangen.',
  },
  spreading_activation: {
    label: 'Ausbreitende Aktivierung',
    description: 'Mechanismus, der die Bedeutung eines Elements wie eine Welle durch ein Netz an seine Nachbarn im Graphen weitergibt.',
  },
  fabric: {
    label: 'Wissensgewebe',
    description: 'Das Wissensnetz des Projekts — die Gesamtheit der Verbindungen zwischen Notizen, Entscheidungen und Code.',
  },
  trajectory: {
    label: 'Verlauf',
    description: 'Geschichte des Wegs, den ein Assistent oder eine Aufgabe durch die Phasen des Projekts genommen hat.',
  },
  protocol: {
    label: 'Protokoll',
    description: 'Endlicher Zustandsautomat, der einen Arbeitsablauf beschreibt. Legt die zulässigen Übergänge zwischen Status fest.',
  },
  persona: {
    label: 'Persona',
    description: 'Spezialisiertes Profil, das einem Assistenten zugewiesen wird, um sein Verhalten und seine Fähigkeiten zu steuern.',
  },
  episode: {
    label: 'Episode',
    description: 'Aufgezeichnete Arbeitssitzung eines Assistenten, mit den ausgeführten Aktionen und den erzielten Ergebnissen.',
  },
  neural_routing: {
    label: 'Neuronales Routing',
    description: 'Intelligente Verteilung von Aufgaben auf Assistenten, abhängig von ihren Fähigkeiten und ihrer Auslastung.',
  },
  milestone: {
    label: 'Ziel',
    description: 'Wichtige Wegmarke im Projekt. Bündelt Aufgaben und kennzeichnet einen entscheidenden Fortschritt.',
  },
  feature_graph: {
    label: 'Funktionsgraph',
    description: 'Darstellung der Abhängigkeiten zwischen den Funktionen des Projekts: welche Funktion von welcher abhängt.',
  },
  lifecycle_hook: {
    label: 'Lebenszyklus-Hook',
    description: 'Automatische Aktion, die durch einen Statuswechsel ausgelöst wird (z. B. eine Benachrichtigung, wenn eine Aufgabe auf „abgeschlossen“ wechselt).',
  },
  constraint: {
    label: 'Einschränkung',
    description: 'Regel oder Begrenzung, die für eine Aufgabe oder einen Plan gilt. Sie muss eingehalten werden, damit die Arbeit als gültig zählt.',
  },
  decision: {
    label: 'Entscheidung',
    description: 'Architektonische oder technische Wahl, mit Kontext und Begründung festgehalten, damit man sie später nachschlagen kann.',
  },
  component: {
    label: 'Komponente',
    description: 'Funktionales Modul des Projekts (Backend, Frontend, API…), das Code und Zuständigkeiten ordnet.',
  },
  workspace: {
    label: 'Arbeitsbereich',
    description: 'Abgeschlossener Behälter, der Projekte, Aufgaben und Ressourcen bündelt. Hält verschiedene Arbeitskontexte getrennt.',
  },
  skill: {
    label: 'Fähigkeit',
    description: 'Festgehaltene Fähigkeit eines Assistenten: was er kann und auf welchem Beherrschungsniveau.',
  },
  release: {
    label: 'Version',
    description: 'Veröffentlichte Version des Projekts, die eine Reihe produktionsreifer Änderungen bündelt.',
  },
  success_rate: {
    label: 'Erfolgsquote',
    description: 'Prozentsatz der Aufgaben, die diese Persona erfolgreich abgeschlossen hat. Zeigt ihre Zuverlässigkeit bei den übertragenen Aufträgen.',
  },
  activation_count: {
    label: 'Aktivierungen',
    description: 'Wie oft ein Element aktiviert (von einem Assistenten genutzt) wurde. Je höher die Zahl, desto häufiger wird es herangezogen.',
  },
  analysis_profile: {
    label: 'Analyseprofil',
    description: 'Konfiguration, die festlegt, wie ein Projekt analysiert wird: welche Kennzahlen berechnet und welche Schwellenwerte angewendet werden.',
  },
  co_change: {
    label: 'Gemeinsame Änderung',
    description: 'Dateien, die oft zusammen geändert werden. Starke gemeinsame Änderung deutet auf Kopplung hin (gewollt oder zufällig).',
  },
  coupling: {
    label: 'Kopplung',
    description: 'Grad der Abhängigkeit zwischen zwei Modulen. Für die Wartbarkeit ist lose Kopplung besser.',
  },
  churn: {
    label: 'Änderungshäufigkeit',
    description: 'Wie oft eine Datei geändert wird. Hohe Änderungshäufigkeit kann auf einen instabilen oder aktiv entwickelten Bereich hindeuten.',
  },
  hotspot: {
    label: 'Hotspot',
    description: 'Häufig geänderte, komplexe Datei. Hotspots sind Bereiche, die man im Auge behalten sollte, weil sich dort das Fehlerrisiko bündelt.',
  },
  orphan: {
    label: 'Verwaiste Datei',
    description: 'Datei, die von keiner anderen Datei importiert oder exportiert wird. Kann auf toten Code oder eine schlecht eingebundene Datei hindeuten.',
  },
  dead_note: {
    label: 'Tote Notiz',
    description: 'Notiz ohne verbleibende Energie — sie wurde lange nicht gelesen oder geändert und ist wahrscheinlich überholt.',
  },
  stale_note: {
    label: 'Veraltete Notiz',
    description: 'Notiz, deren Inhalt seit einiger Zeit nicht aktualisiert wurde und den heutigen Stand des Projekts womöglich nicht mehr wiedergibt.',
  },
  god_function: {
    label: 'Gott-Funktion',
    description: 'Übermäßig lange oder komplexe Funktion, die zu viel auf einmal erledigt. Sie sollte in kleinere Funktionen aufgeteilt werden.',
  },
  clustering_coefficient: {
    label: 'Clustering-Koeffizient',
    description: 'Misst, wie dicht die Nachbarn eines Knotens untereinander verbunden sind. Ein hoher Koeffizient zeigt eine eng vernetzte Gruppe an.',
  },
  knowledge_coverage: {
    label: 'Wissensabdeckung',
    description: 'Verhältnis zwischen der Zahl der Notizen und Entscheidungen und der Zahl der Codedateien. Zeigt, ob der Code gut dokumentiert ist.',
  },
  note_freshness: {
    label: 'Aktualität der Notizen',
    description: 'Anteil der Notizen, die noch aktuell sind. Ein niedriger Wert heißt, dass viele Notizen erneut gelesen werden sollten.',
  },
  synapse_quality: {
    label: 'Synapsenqualität',
    description: 'Anteil der stabilen Verbindungen im Netz. Schwache Synapsen sind unzuverlässige Verknüpfungen zwischen Elementen.',
  },
  skills_maturity: {
    label: 'Fähigkeitsreife',
    description: 'Verhältnis der aktiven Fähigkeiten zur Gesamtzahl. Zeigt das allgemeine Beherrschungsniveau des Teams im Projekt.',
  },
  code_safety: {
    label: 'Codesicherheit',
    description: 'Wert auf Grundlage der Risikobewertung. Berücksichtigt kritische und hochriskante Dateien sowie Schwachstellen.',
  },
  health_score: {
    label: 'Gesundheitswert',
    description: 'Gesamtwert aus Wissensabdeckung, Aktualität der Notizen, neuronaler Energie, Synapsenqualität und Fähigkeitsreife.',
  },
  circular_dependency: {
    label: 'Zirkuläre Abhängigkeit',
    description: 'Zwei Module hängen voneinander ab und bilden eine Schleife. Das erschwert Wartung und Tests des Codes.',
  },
} satisfies Translation<'glossary'>
