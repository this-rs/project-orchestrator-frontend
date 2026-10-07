import type { Translation } from '../../catalog.ts'

export default {
  modes: {
    primary: { label: 'Só principal', description: 'Um único provedor principal exclusivo, como hoje. O PO apenas registra o que teria escolhido.' },
    mixed: { label: 'Misto', description: 'O principal conduz a conversa; o PO roteia os executores.' },
    full: { label: 'Completo', description: 'O PO escolhe tudo e explica por quê.' },
  },
  stages: {
    shadow: { label: 'Sombra', description: 'Nada é aplicado; cada decisão é registrada.' },
    advisory: { label: 'Conselho', description: 'O PO sugere; você confirma.' },
    auto: { label: 'Automático', description: 'O PO aplica suas decisões.' },
  },
  routedBy: {
    session: 'Escolhido para a sessão',
    request: 'Escolhido na requisição',
    task: 'Escolhido pela tarefa',
    persona: 'Escolhido pela persona',
    run: 'Escolhido pela execução',
    project_rule: 'Regra do projeto',
    global_rule: 'Regra global',
    default: 'Padrão do servidor',
    claude_code: 'Reserva do Claude Code',
    fallback: 'Cadeia de reserva',
    auto: 'O PO escolheu',
  },
  rejection: {
    not_allowed: 'Não permitido neste projeto',
    unhealthy: 'Indisponível',
    no_tools: 'Não chama ferramentas',
    context_too_small: 'Janela de contexto pequena demais',
    no_images: 'Não lê imagens',
    over_budget: 'Orçamento excedido',
    trust_without_sandbox: 'Modo de confiança sem sandbox',
    remote: 'Remoto, não permitido aqui',
  },
  badge: { poChooses: 'O PO escolhe', why: 'Por quê?' },
  advanced: { force: 'Forçar um provedor' },
  settings: { title: 'Roteamento', confirmAuto: 'O PO passará a aplicar as próprias escolhas sem perguntar. Continuar?' },
  report: { agreement: 'Concordância com a escolha real', costDelta: 'Diferença de custo estimada', unknown: 'Desconhecido' },
} satisfies Translation<'routing'>
