import type { Translation } from '../../catalog.ts'

export default {
  back: "Voltar",
  settings: {
    title: "Configurações",
    description: "Configurações do aplicativo de desktop. Elas valem para todas as conversas com os assistentes.",
    chatTitle: "Chat e IA",
    chatDescription: "Modo de permissão, ferramentas permitidas e negadas, variáveis de ambiente e a CLI do Claude Code usada pelos assistentes.",
    updatesTitle: "Atualizações",
    updatesDescription: "Verifique se há uma nova versão do aplicativo de desktop e instale-a.",
    providersNote: "Os provedores (instâncias, consentimento por projeto, papéis e política de modelos) têm sua própria página:",
    providersLink: "Provedores → /providers",
    explain: {
      what: "As configurações são as escolhas do próprio aplicativo de desktop: como os assistentes podem agir nesta máquina e como o aplicativo se atualiza.",
      why: "Você decide uma vez o que um assistente pode executar, quais ferramentas pode usar e em qual versão você está.",
      different: "Hoje essas escolhas estão espalhadas entre arquivos de configuração e flags de terminal. Aqui elas ficam em uma só tela, aplicada a todas as conversas.",
    },
  },
  providers: {
    title: "Provedores",
    description: "Onde suas conversas rodam, o que cada projeto pode enviar para lá e qual modelo faz o quê.",
    explain: {
      what: "Sua escolha de IA: o Claude Code já vem integrado, e você pode registrar outro provedor e liberá-lo projeto a projeto.",
      why: "Você escolhe o provedor e o modelo de uma conversa, e uma chave nunca é digitada em um formulário: ela fica no cofre.",
      different: "Hoje uma ferramenta significa um modelo. Aqui uma conversa permanece no seu provedor, e o assistente que delega uma tarefa pode indicar o provedor e o modelo para ela.",
    },
  },
} satisfies Translation<'settingsPage'>
