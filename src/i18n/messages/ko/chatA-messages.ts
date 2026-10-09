import type { Translation } from '../../catalog.ts'

export default {
  copy: {
    title: "마크다운으로 복사",
    copied: "복사됨!",
    popupTitle: "메시지 마크다운"
  },
  compact: {
    label: "컨텍스트 압축됨",
    trigger: {
      auto: "자동",
      manual: "수동"
    },
    tokens: "약 {count}K 토큰"
  },
  continued: {
    label: "계속됨",
    afterOne: "{count}턴 후",
    afterMany: "{count}턴 후"
  },
  bubble: {
    references: "참조",
    attachments: "첨부 파일",
    copyMessage: "메시지를 마크다운으로 복사",
    copyReply: "답변을 마크다운으로 복사",
    thinking: "생각하는 중..."
  },
  list: {
    loading: "메시지를 불러오는 중...",
    loadingOlder: "이전 메시지를 불러오는 중...",
    beginning: "— 대화 시작 —",
    loadingNewer: "최신 메시지를 불러오는 중...",
    scrollMore: "— 아래로 스크롤하면 더 볼 수 있습니다 —",
    catchingUp: "따라잡는 중…",
    newActivity: "새 활동 ↓"
  },
  compaction: {
    label: "컨텍스트 압축 중"
  },
  welcome: {
    title: "Project Orchestrator",
    subtitle: "무엇을 하시겠어요?",
    quickActions: "빠른 작업",
    selectProject: "빠른 작업을 사용하려면 위에서 프로젝트를 선택하세요",
    projectStatus: "프로젝트 상태",
    activePlanOne: "활성 플랜 {count}개",
    activePlanMany: "활성 플랜 {count}개",
    toReview: "검토 필요 {count}개",
    allClear: "모두 완료",
    notesOne: "노트 {count}개",
    notesMany: "노트 {count}개",
    synced: "{when} 동기화됨",
    untitled: "제목 없음",
    untitledConversation: "제목 없는 대화",
    recent: "최근 대화",
    actions: {
      next: {
        label: "다음 작업",
        description: "다음으로 할 수 있는 작업 가져오기",
        prompt: "활성 플랜에서 다음으로 할 수 있는 작업이 무엇인가요? 컨텍스트와 단계를 보여 주세요."
      },
      plan: {
        label: "무언가 계획하기",
        description: "구현 계획하기",
        prompt: "다음의 구현을 계획해 주세요: "
      },
      impact: {
        label: "영향 분석",
        description: "변경의 영향 분석",
        prompt: "다음을 변경할 때의 영향을 분석해 주세요: "
      },
      arch: {
        label: "아키텍처",
        description: "코드베이스 개요",
        prompt: "프로젝트 아키텍처의 개요를 알려 주세요"
      },
      search: {
        label: "코드 검색",
        description: "코드베이스에서 검색",
        prompt: "코드에서 다음을 검색해 주세요: "
      },
      roadmap: {
        label: "로드맵",
        description: "마일스톤 및 릴리스",
        prompt: "마일스톤과 릴리스가 포함된 전체 로드맵을 보여 주세요"
      }
    },
    time: {
      now: "방금",
      minutes: "{count}분 전",
      hours: "{count}시간 전",
      days: "{count}일 전",
      months: "{count}개월 전"
    },
    plan: {
      draft: "초안",
      approved: "승인됨",
      in_progress: "진행 중",
      completed: "완료",
      cancelled: "취소됨"
    }
  },
  panel: {
    connected: "연결됨",
    reconnecting: "다시 연결하는 중…",
    disconnected: "연결 끊김",
    connectionLost: "연결이 끊겼습니다",
    exportTitle: "채팅 내보내기",
    newChatTitle: "새 채팅",
    chatTitle: "채팅",
    conversations: "대화",
    newConversation: "새 대화",
    backToChat: "채팅으로 돌아가기",
    sessions: "세션",
    newChat: "새 채팅",
    assistantTree: "어시스턴트 트리",
    permissionSettings: "권한 설정",
    copied: "복사됨!",
    copyChat: "채팅을 마크다운으로 복사",
    exitFullscreen: "전체 화면 종료",
    close: "닫기",
    backToParent: "상위로 돌아가기",
    actions: "대화 작업",
    attach: "플랜 또는 작업에 연결…",
    hideTree: "어시스턴트 트리 숨기기",
    showTree: "어시스턴트 트리 표시",
    fullscreen: "전체 화면",
    noProjectsTitle: "아직 프로젝트가 없습니다",
    noProjectsBody: "이 워크스페이스에 프로젝트를 추가하여 Claude와 대화를 시작하세요.",
    addProject: "프로젝트 추가"
  }
} satisfies Translation<'chatA-messages'>
