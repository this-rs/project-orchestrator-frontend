import type { Translation } from '../../catalog.ts'

export default {
  neutral: {
    trust: "Rock'n roll",
    auto_edits: 'Aprovar edições automaticamente',
    ask: 'Perguntar',
    plan_only: 'Somente planejar',
  },
  composer: {
    trust: "Rock'n roll",
    auto_edits: 'Aceitar edições',
    ask: 'Padrão',
    plan_only: 'Somente planejar',
  },
  session: {
    trust: "Rock'n roll",
    auto_edits: 'Aceitar edições',
    ask: 'Pedir permissões',
    plan_only: 'Modo de planejamento',
  },
  native: {
    auto: { short: 'Auto', long: 'Modo automático' },
    dontAsk: { short: 'Não perguntar', long: 'Não perguntar' },
  },
  settings: {
    claude: {
      trust: { label: "Rock'n roll", description: 'Aprova todas as ferramentas automaticamente. Sem confirmações.' },
      auto_edits: { label: 'Aceitar edições', description: 'Aprova edições de arquivos automaticamente e pede confirmação para comandos.' },
      ask: { label: 'Padrão', description: 'Pede confirmação para qualquer uso de ferramenta.' },
      plan_only: { label: 'Somente planejar', description: 'Modo somente leitura. Sem gravações nem comandos.' },
    },
    neutral: {
      trust: { description: 'Executa todas as ferramentas sem perguntar.' },
      auto_edits: { description: 'As edições de arquivos rodam sem perguntar; os comandos ainda pedem confirmação.' },
      ask: { description: 'Pergunta antes de cada chamada de ferramenta.' },
      plan_only: { description: 'Somente leitura. Sem gravações nem comandos.' },
    },
  },
  setup: {
    trust: {
      label: "Rock'n roll",
      description: 'Todas as ferramentas aprovadas automaticamente: sem pedidos de permissão',
      summary: "Rock'n roll (tudo aprovado automaticamente)",
    },
    ask: {
      label: 'Padrão',
      description: 'Pede aprovação para edições de arquivos e comandos de shell',
      summary: 'Padrão (pergunta para edições e shell)',
    },
    auto_edits: {
      label: 'Aceitar edições',
      description: 'Edições de arquivos aprovadas automaticamente; comandos de shell precisam de aprovação',
      summary: 'Aceitar edições (pergunta só para shell)',
    },
    plan_only: {
      label: 'Somente planejar',
      description: 'Modo somente leitura: o Claude pode ler, mas não modificar arquivos',
      summary: 'Somente planejar (somente leitura)',
    },
  },
  trustRequiresSandbox: 'Indisponível: esta máquina remota não permite este modo. Ative-o nas configurações da instância para executar as ferramentas sem confirmação.',
  rulesUnsupported: 'As regras de permitir e negar são específicas do Claude Code. Este provedor não as aplica, por isso não são exibidas: o modo de permissão acima é o que governa as ferramentas dele.',
  trustDowngraded: 'O modo “Rock’n roll” foi substituído por “Perguntar”: esta máquina remota não o permite.',
} satisfies Translation<'toolPolicy'>
