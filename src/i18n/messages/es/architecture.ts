import type { Translation } from '../../catalog.ts'

export default {
  componentTypes: {
    service: 'Servicio',
    frontend: 'Frontend',
    worker: 'Worker',
    database: 'Base de datos',
    message_queue: 'Cola',
    cache: 'Caché',
    gateway: 'Pasarela',
    external: 'Externo',
    library: 'Biblioteca',
    cli: 'CLI',
    other: 'Otro',
  },
  tiers: {
    entry: 'Puntos de entrada',
    gateway: 'Pasarela',
    services: 'Servicios',
    libraries: 'Bibliotecas, mensajería y caché',
    data: 'Datos y externos',
    other: 'Otros',
  },
  legend: {
    required: 'Obligatorio',
    optional: 'Opcional — el sistema funciona sin él',
    direction: 'De izquierda a derecha: por dónde entra la gente → servicios → datos',
    select: 'Selecciona un componente para ver qué se caería con él',
  },
  panel: {
    details: 'Detalles de {name}',
    close: 'Cerrar detalles',
    optional: 'opcional',
    dependedOnBy: 'Dependen de él ({n})',
    dependsOn: 'Depende de ({n})',
    nothingDependsOnThis: 'Nada depende de esto.',
    dependsOnNothing: 'No depende de nada.',
    derivedFrom: 'Derivado de {source}',
  },
  description: 'El sistema tal como está construido: componentes y qué depende de qué.',
  loadFailed: 'No se pudo cargar la arquitectura',
  emptyTitle: 'Aún no hay arquitectura',
  emptyDescription:
    'Añade componentes (servicios, bases de datos, colas…) al espacio de trabajo, o pide a un asistente que mapee el sistema.',
  graphLabel: 'Grafo de arquitectura',
  outline: 'Esquema de la arquitectura',
} satisfies Translation<'architecture'>
