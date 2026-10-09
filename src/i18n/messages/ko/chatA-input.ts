import type { Translation } from '../../catalog.ts'

export default {
  ask: {
    answered: "답변함:",
    placeholder: "또는 답변을 입력하세요...",
    submit: "제출",
    notSent: "전송되지 않음: 연결이 끊겼습니다. 답변은 보관되어 있으니 다시 연결되면 다시 시도하세요."
  },
  attachments: {
    processing: "처리 중…",
    remove: "제거",
    removeAria: "{name} 제거",
    pendingSend: "업로드가 끝나면 메시지가 전송됩니다"
  },
  upload: {
    network: "네트워크 오류 — 파일이 서버에 도달하지 못했습니다",
    timeout: "서버가 제때 응답하지 않았습니다 — 파일을 제거한 뒤 다시 추가하세요",
    tooLarge: "파일이 너무 큽니다",
    unsupported: "지원하지 않는 파일 형식입니다",
    unreadable: "파일을 읽을 수 없습니다(형식 오류 또는 손상)",
    forbidden: "여기에 업로드할 수 없습니다",
    failed: "업로드 실패(HTTP {status})"
  },
  action: {
    send: "메시지 보내기",
    stop: "생성 중지",
    stopping: "중지하는 중…",
    waiting: "첨부 파일 업로드가 끝나기를 기다리는 중",
    idle: "메시지 보내기",
    removeFailed: "먼저 실패한 첨부 파일을 제거하세요",
    waitingUpload: "업로드가 끝나기를 기다리는 중"
  },
  composer: {
    imageName: "이미지",
    alreadyIn: "{label}은(는) 이미 메시지에 있습니다.",
    added: "{label}을(를) 메시지에 추가했습니다.",
    close: "닫기",
    maxRefs: "메시지당 참조는 최대 {max}개입니다. 마지막 참조는 추가되지 않았습니다.",
    references: "참조",
    placeholder: "메시지 보내기...",
    attach: "파일 첨부",
    override: "(재정의)",
    default: "기본값",
    auto: "자동",
    autoOn: "자동 계속 사용 중",
    autoOff: "자동 계속 사용 안 함",
    drop: "놓아서 첨부"
  }
} satisfies Translation<'chatA-input'>
