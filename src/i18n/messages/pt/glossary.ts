import type { Translation } from '../../catalog.ts'

export default {
  energy: {
    label: 'Energia',
    description: 'Nível de atividade recente de um elemento. Quanto maior a energia, mais ativamente o elemento está sendo trabalhado.',
  },
  cohesion: {
    label: 'Coesão',
    description: 'Medida da força interna de um módulo ou componente. Uma coesão alta significa que seus elementos estão bem ligados entre si.',
  },
  synapse: {
    label: 'Sinapse',
    description: 'Conexão entre dois elementos do projeto (notas, tarefas, arquivos). Representa uma relação de dependência ou de contexto.',
  },
  scar: {
    label: 'Cicatriz',
    description: 'Marca deixada por um problema passado. Ajuda a evitar repetir os mesmos erros ao sinalizar áreas frágeis.',
  },
  moat: {
    label: 'Fosso',
    description: 'Barreira de proteção em torno de um componente crítico. Indica que mudanças ali pedem cuidado extra.',
  },
  spreading_activation: {
    label: 'Ativação por propagação',
    description: 'Mecanismo que propaga a importância de um elemento para seus vizinhos no grafo, como uma onda numa rede.',
  },
  fabric: {
    label: 'Tecido',
    description: 'A rede de conhecimento do projeto: o conjunto de conexões entre notas, decisões e código.',
  },
  trajectory: {
    label: 'Trajetória',
    description: 'Histórico do caminho que um assistente ou uma tarefa percorreu pelas etapas do projeto.',
  },
  protocol: {
    label: 'Protocolo',
    description: 'Máquina de estados finitos que descreve um fluxo de trabalho. Define as transições válidas entre os status.',
  },
  persona: {
    label: 'Persona',
    description: 'Perfil especializado atribuído a um assistente para orientar seu comportamento e suas habilidades.',
  },
  episode: {
    label: 'Episódio',
    description: 'Sessão de trabalho registrada de um assistente, com as ações realizadas e os resultados obtidos.',
  },
  neural_routing: {
    label: 'Roteamento neural',
    description: 'Distribuição inteligente de tarefas entre assistentes, com base em suas habilidades e carga de trabalho.',
  },
  milestone: {
    label: 'Objetivo',
    description: 'Ponto de controle importante do projeto. Agrupa tarefas e marca uma etapa-chave do progresso.',
  },
  feature_graph: {
    label: 'Grafo de funcionalidades',
    description: 'Visualização das dependências entre as funcionalidades do projeto, mostrando quais dependem de quais.',
  },
  lifecycle_hook: {
    label: 'Gancho de ciclo de vida',
    description: 'Ação automática disparada por uma mudança de status (por exemplo, uma notificação quando uma tarefa passa para \'completed\').',
  },
  constraint: {
    label: 'Restrição',
    description: 'Regra ou limitação que se aplica a uma tarefa ou a um plano. Deve ser respeitada para que o trabalho seja considerado válido.',
  },
  decision: {
    label: 'Decisão',
    description: 'Escolha arquitetural ou técnica registrada com seu contexto e sua justificativa, para consulta futura.',
  },
  component: {
    label: 'Componente',
    description: 'Módulo funcional do projeto (back-end, front-end, API…) usado para organizar o código e as responsabilidades.',
  },
  workspace: {
    label: 'Espaço de trabalho',
    description: 'Contêiner isolado que reúne projetos, tarefas e recursos. Mantém separados os diferentes contextos de trabalho.',
  },
  skill: {
    label: 'Habilidade',
    description: 'Capacidade registrada de um assistente, que descreve o que ele sabe fazer e em que nível de domínio.',
  },
  release: {
    label: 'Versão publicada',
    description: 'Versão publicada do projeto, que reúne um conjunto de mudanças prontas para produção.',
  },
  success_rate: {
    label: 'Taxa de sucesso',
    description: 'Porcentagem de tarefas concluídas com sucesso por esta persona. Reflete sua confiabilidade nas missões atribuídas.',
  },
  activation_count: {
    label: 'Ativações',
    description: 'Número de vezes que um elemento foi ativado (usado por um assistente). Quanto maior o número, mais o elemento é requisitado.',
  },
  analysis_profile: {
    label: 'Perfil de análise',
    description: 'Configuração que define como analisar um projeto: quais métricas calcular e quais limites aplicar.',
  },
  co_change: {
    label: 'Co-alteração',
    description: 'Arquivos que costumam mudar juntos. Uma co-alteração forte sugere acoplamento (intencional ou acidental).',
  },
  coupling: {
    label: 'Acoplamento',
    description: 'Grau de dependência entre dois módulos. Um acoplamento baixo é preferível para a manutenção.',
  },
  churn: {
    label: 'Rotatividade (churn)',
    description: 'Frequência com que um arquivo é modificado. Uma rotatividade alta pode indicar uma área instável ou em desenvolvimento ativo.',
  },
  hotspot: {
    label: 'Ponto crítico (hotspot)',
    description: 'Arquivo complexo e modificado com frequência. Os pontos críticos são áreas a vigiar, pois concentram o risco de bugs.',
  },
  orphan: {
    label: 'Arquivo órfão',
    description: 'Arquivo que não é importado nem exportado por outros arquivos. Pode indicar código morto ou um arquivo mal integrado.',
  },
  dead_note: {
    label: 'Nota morta',
    description: 'Nota sem energia residual: não é lida nem modificada há muito tempo e provavelmente está obsoleta.',
  },
  stale_note: {
    label: 'Nota desatualizada',
    description: 'Nota cujo conteúdo não é atualizado há algum tempo e que pode não refletir mais o estado atual do projeto.',
  },
  god_function: {
    label: 'Função deus',
    description: 'Função excessivamente longa ou complexa que faz coisas demais. Deveria ser dividida em funções menores.',
  },
  clustering_coefficient: {
    label: 'Coeficiente de agrupamento',
    description: 'Mede a densidade das conexões entre os vizinhos de um nó. Um coeficiente alto indica um grupo fortemente interligado.',
  },
  knowledge_coverage: {
    label: 'Cobertura de conhecimento',
    description: 'Proporção entre o número de notas e decisões e o número de arquivos de código. Indica se o código está bem documentado.',
  },
  note_freshness: {
    label: 'Atualidade das notas',
    description: 'Parcela das notas que ainda estão em dia. Uma taxa baixa significa que muitas notas precisam ser relidas.',
  },
  synapse_quality: {
    label: 'Qualidade das sinapses',
    description: 'Parcela das conexões sólidas na rede. Sinapses fracas são ligações pouco confiáveis entre elementos.',
  },
  skills_maturity: {
    label: 'Maturidade das habilidades',
    description: 'Proporção de habilidades ativas em relação ao total. Indica o nível geral de domínio da equipe sobre o projeto.',
  },
  code_safety: {
    label: 'Segurança do código',
    description: 'Pontuação baseada na avaliação de riscos. Leva em conta os arquivos de risco crítico e alto e as vulnerabilidades.',
  },
  health_score: {
    label: 'Pontuação de saúde',
    description: 'Pontuação geral que combina cobertura de conhecimento, atualidade das notas, energia neural, qualidade das sinapses e maturidade das habilidades.',
  },
  circular_dependency: {
    label: 'Dependência circular',
    description: 'Situação em que dois módulos dependem um do outro, criando um laço. Torna o código mais difícil de manter e de testar.',
  },
} satisfies Translation<'glossary'>
