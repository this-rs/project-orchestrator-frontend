import type { Translation } from '../../catalog.ts'

export default {
  componentTypes: {
    service: 'Serviço',
    frontend: 'Frontend',
    worker: 'Worker',
    database: 'Banco de dados',
    message_queue: 'Fila',
    cache: 'Cache',
    gateway: 'Gateway',
    external: 'Externo',
    library: 'Biblioteca',
    cli: 'CLI',
    other: 'Outro',
  },
  tiers: {
    entry: 'Pontos de entrada',
    gateway: 'Gateway',
    services: 'Serviços',
    libraries: 'Bibliotecas, mensageria e cache',
    data: 'Dados e externos',
    other: 'Outros',
  },
  legend: {
    required: 'Obrigatório',
    optional: 'Opcional — o sistema funciona sem ele',
    direction: 'Da esquerda para a direita: por onde as pessoas entram → serviços → dados',
    select: 'Selecione um componente para ver o que cairia com ele',
  },
  panel: {
    details: 'Detalhes de {name}',
    close: 'Fechar detalhes',
    optional: 'opcional',
    dependedOnBy: 'Dependem dele ({n})',
    dependsOn: 'Depende de ({n})',
    nothingDependsOnThis: 'Nada depende disto.',
    dependsOnNothing: 'Não depende de nada.',
    derivedFrom: 'Derivado de {source}',
  },
  description: 'O sistema como foi construído: componentes e o que depende de quê.',
  loadFailed: 'Falha ao carregar a arquitetura',
  emptyTitle: 'Ainda não há arquitetura',
  emptyDescription:
    'Adicione componentes (serviços, bancos de dados, filas…) ao espaço de trabalho, ou peça a um assistente para mapear o sistema.',
  graphLabel: 'Grafo de arquitetura',
  outline: 'Estrutura da arquitetura',
} satisfies Translation<'architecture'>
