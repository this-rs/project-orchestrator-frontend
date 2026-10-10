import type { Translation } from '../../catalog.ts'

export default {
  ask: {
    answered: "Respondido:",
    placeholder: "Ou digite sua resposta...",
    submit: "Enviar",
    notSent: "Não enviado: conexão perdida. Sua resposta foi mantida; tente novamente quando reconectar."
  },
  attachments: {
    processing: "Processando…",
    remove: "Remover",
    removeAria: "Remover {name}",
    pendingSend: "A mensagem será enviada quando o upload terminar"
  },
  upload: {
    network: "Erro de rede — o arquivo nunca chegou ao servidor",
    timeout: "O servidor não respondeu a tempo — remova o arquivo e adicione-o novamente",
    tooLarge: "Arquivo grande demais",
    unsupported: "Formato de arquivo não suportado",
    unreadable: "Não foi possível ler o arquivo (malformado ou danificado)",
    forbidden: "Sem permissão para enviar arquivos aqui",
    failed: "Falha no upload (HTTP {status})"
  },
  action: {
    send: "Enviar mensagem",
    stop: "Parar a geração",
    stopping: "Parando…",
    waiting: "Aguardando o upload dos anexos terminar",
    idle: "Enviar mensagem",
    removeFailed: "Remova primeiro o anexo com falha",
    waitingUpload: "Aguardando o upload terminar"
  },
  composer: {
    imageName: "imagem",
    alreadyIn: "{label} já está na mensagem.",
    added: "{label} adicionado à mensagem.",
    close: "Fechar",
    maxRefs: "Máximo de {max} referências por mensagem: a última não foi adicionada.",
    references: "Referências",
    placeholder: "Enviar uma mensagem...",
    attach: "Anexar um arquivo",
    override: "(substituído)",
    default: "padrão",
    auto: "Auto",
    autoOn: "Continuação automática ativada",
    autoOff: "Continuação automática desativada",
    drop: "Solte para anexar"
  }
} satisfies Translation<'chatA-input'>
