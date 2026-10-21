import type { Translation } from '../../catalog.ts'

export default {
  agent: {
    asked: "서브에이전트에게 맡긴 일",
    kind: "에이전트 종류",
    answer: "그 답변",
    failed: "서브에이전트가 실패했습니다",
    open: "하위 대화 열기",
    openTitle: "이 서브에이전트가 작업한 대화 열기",
    running: "서브에이전트가 아직 작업 중입니다…",
    noChild: "하위 대화가 아직 목록에 없습니다",
    noChildTitle: "하위 대화는 이 도구 호출의 식별자로 찾습니다. 서버가 목록에 올리면 바로 나타납니다."
  },
  /** WebFetch / WebSearch: their result is data from the outside, never the assistant's text. */
  web: {
    externalSearch: "검색 결과: 외부 콘텐츠이며, 어시스턴트가 쓴 것이 아닙니다",
    externalPage: "페이지 내용: 외부 콘텐츠이며, 어시스턴트가 쓴 것이 아닙니다",
  },
  bash: {
    emptyCommand: "(빈 명령)",
    showLess: "접기",
    showMore: "{count}자 더 보기",
    noOutput: "출력 없음",
    running: "실행 중..."
  },
  default: {
    input: "입력",
    error: "오류",
    result: "결과",
    truncated: "... (잘림)"
  },
  edit: {
    replaceAll: "모두 바꾸기",
    removedLineOne: "-{count}줄",
    removedLineMany: "-{count}줄",
    addedLineOne: "+{count}줄",
    addedLineMany: "+{count}줄",
    moreRemovedOne: "... 삭제된 줄 {count}개 더 있음",
    moreRemovedMany: "... 삭제된 줄 {count}개 더 있음",
    moreAddedOne: "... 추가된 줄 {count}개 더 있음",
    moreAddedMany: "... 추가된 줄 {count}개 더 있음",
    truncated: "... (잘림)",
    editing: "편집 중..."
  },
  chat: {
    you: "나",
    assistant: "어시스턴트",
    messageOne: "메시지 {count}개",
    messageMany: "메시지 {count}개"
  },
  code: {
    copyPath: "경로 복사",
    noResults: "결과 없음",
    searchResults: "검색 결과",
    noSymbols: "심볼을 찾을 수 없습니다",
    noReferences: "참조를 찾을 수 없습니다",
    unknownFile: "(알 수 없음)",
    references: "참조",
    calledBy: "호출한 곳",
    calls: "호출 대상",
    noCallGraph: "호출 그래프 데이터 없음",
    callersColon: "호출자:",
    dependentFiles: "의존하는 파일",
    mostConnected: "가장 많이 연결된 파일",
    imports: "임포트",
    importedBy: "임포트한 곳",
    label: {
      results: "결과",
      files: "파일",
      callers: "호출자",
      callees: "피호출자",
      imports: "임포트",
      dependents: "의존 대상"
    },
    cat: {
      functions: "함수",
      structs: "구조체",
      enums: "열거형",
      traits: "트레이트",
      impls: "impl",
      macros: "매크로",
      constants: "상수",
      type_aliases: "타입 별칭"
    },
    symbols: {
      implementations: "구현",
      traits: "트레이트",
      impls: "impl 블록"
    },
    symbolsNone: {
      implementations: "구현을 찾을 수 없습니다",
      traits: "트레이트를 찾을 수 없습니다",
      impls: "impl 블록을 찾을 수 없습니다"
    }
  },
  entity: {
    project: "프로젝트",
    created: "생성일",
    plan: "플랜",
    path: "경로",
    synced: "동기화",
    target: "목표",
    verify: "검증",
    tasks: "작업",
    constraints: "제약 조건",
    criteria: "수락 기준",
    steps: "단계",
    decisions: "결정",
    label: {
      tasks: "작업",
      constraints: "제약 조건",
      criteria: "기준",
      steps: "단계",
      decisions: "결정"
    },
    type: {
      plan: "플랜",
      task: "작업",
      project: "프로젝트",
      milestone: "마일스톤",
      workspace: "워크스페이스",
      note: "노트",
      release: "릴리스"
    },
    view: {
      entity: "{entity} 보기",
      parentTask: "상위 작업 보기",
      parentPlan: "상위 플랜 보기",
      linkedTask: "연결된 작업 보기",
      linkedPlan: "연결된 플랜 보기"
    },
    deleted: "삭제됨",
    updated: "업데이트됨",
    createdVerb: "생성됨",
    moreFields: "필드 {count}개 더 있음"
  },
  list: {
    untitledPlan: "제목 없는 플랜",
    untitledSession: "제목 없는 세션",
    msgOne: "{count}건",
    msgMany: "{count}건",
    energy: "에너지 수준",
    target: "목표: {date}",
    noResults: "결과 없음",
    resultOne: "결과 {count}개",
    resultMany: "결과 {count}개",
    matching: "“{query}”와(과) 일치"
  },
  viz: {
    noRadar: "사용할 수 있는 레이더 데이터가 없습니다.",
    unknownTarget: "알 수 없음",
    direct: "직접({count})",
    transitive: "전이({count})",
    total: "총 {count}개",
    importance: {
      critical: "치명적",
      high: "높음",
      medium: "보통",
      low: "낮음"
    },
    kind: {
      guideline: "가이드라인",
      gotcha: "함정",
      pattern: "패턴",
      context: "컨텍스트",
      tip: "팁",
      observation: "관찰",
      assertion: "단언",
      decision: "결정"
    },
    iso: {
      loading: "3D 장면 불러오는 중…",
      composing: "3D 장면 작성 중…",
      refused: "이 3D 장면이 거부되었습니다 — 수정할 점:",
      moreProblems: "… 외 {count}개",
      rebuild: "다시 만들기",
      notJson: "이 3D 장면은 유효한 JSON이 아닙니다 ({detail}). 텍스트:",
      notObject: "이 3D 장면은 JSON 객체여야 합니다. 텍스트:",
      tooLarge: "이 3D 장면이 너무 큽니다 (최대 {max}자). 텍스트:"
    },
    mermaid: {
      title: "다이어그램",
      loading: "다이어그램 불러오는 중…",
      composing: "다이어그램 작성 중…",
      refused: "이 다이어그램은 거부되었습니다 — Mermaid 메시지:",
      empty: "이 다이어그램은 비어 있습니다.",
      tooLarge: "이 다이어그램이 너무 큽니다(최대 {max}자). 텍스트:"
    },
    math: {
      composing: "수식 작성 중…",
      refused: "이 수식은 거부되었습니다 — KaTeX 메시지:",
      empty: "이 수식은 비어 있습니다.",
      tooLarge: "이 수식이 너무 깁니다(최대 {max}자). 텍스트:"
    }
  },
  permission: {
    actions: "이 권한 요청에 응답",
    allowOnce: "한 번 허용",
    allowSession: "이 세션 동안",
    deny: "거부",
    sessionHint: "이 대화에서 동일한 호출은 다시 묻지 않음",
    awaiting: "확인을 기다리는 중…",
    sessionCovers: "허용되면 '이 세션 동안'의 적용 범위:",
    forbidden: "이 대화의 소유자만 응답할 수 있습니다. 아무것도 응답되지 않았습니다.",
    ownerUnreadable: "이 대화의 소유자를 확인할 수 없습니다. 아무것도 응답되지 않았습니다. 다시 시도하세요.",
    unconfirmed: "확인을 받지 못했습니다. 다시 응답하세요.",
    scopeRefused: "이 권한은 세션 동안 유지할 수 없습니다 (호출이 다른 명령을 실행하거나 세션이 제공하지 않음). 한 번 허용하거나 거부하세요.",
    allowed: "허용됨",
    allowedSession: "세션 동안 허용됨",
    denied: "거부됨",
    allowAlways: "항상",
    alwaysHint: "이 머신에서 이 프로젝트의 디렉터리에서 실행되는 대화에서는 이 정확한 호출에 대해 다시 묻지 않습니다. 대화가 디렉터리를 바꾼 경우 다시 묻습니다",
    alwaysCovers: "허용하면 「항상」은 다음만 포함합니다:",
    destinationHint: '네트워크 대상입니다. 허용 범위는 오케스트레이터가 정하며 답변하면 알려줍니다',
    destinationCovers: '이 호출이 접근하는 곳:',
    destinationAlwaysHint: '이 프로젝트의 네트워크 동의로 기록될 수 있습니다. 설정 → 네트워크 도구에서 확인하고 철회할 수 있습니다',
    destinationAlwaysCovers: '"항상"은 이 프로젝트의 네트워크 동의로 기록될 수 있습니다(설정 → 네트워크 도구).',
    originQuestion: "이 오리진에 대한 네트워크 액세스를 허용할까요?",
    originScopes: "각 응답이 적용되는 범위",
    originOnce: "한 번: 이 호출만. 아무것도 유지되지 않습니다.",
    originSession: "이 세션 동안: 이 오리진의 모든 페이지, 세션이 끝날 때까지. 아무것도 기록되지 않습니다.",
    originSessionHint: "이 오리진의 모든 페이지, 이 세션 동안",
    originAlways: "항상: 이 프로젝트의 네트워크 동의로 다음에 대해 기록됩니다:",
    originAlwaysRevocable: "설정 → 네트워크 도구에 표시되며 취소할 수 있습니다.",
    originAlwaysHint: "이 프로젝트의 네트워크 동의로 기록되며, 설정 → 네트워크 도구에서 취소할 수 있습니다",
    alwaysRefused: "이 호출은 영구적으로 허용할 수 없습니다(정확한 읽기, 또는 리디렉션이나 연결이 없는 읽기 전용 명령 하나만 가능). 한 번 또는 세션 동안으로 답하세요.",
    allowedAlways: "항상 허용됨"
  },
  lastingRules: {
    title: "항상 허용된 호출",
    description: "영구적으로 허용한 호출(프로젝트별). 각각 이 머신에서 프로젝트 디렉터리에서 실행되는 대화의 그 정확한 호출만 포함합니다. 취소하면 이 머신에서 다음 요청부터 다시 묻습니다.",
    empty: "영구적으로 허용된 호출이 없습니다.",
    disabled: "이 서버는 영구 승인을 보관하지 않습니다.",
    revoke: "취소",
    revoked: "취소됨: 이 머신에서 다음 요청부터 다시 묻습니다.",
    loadFailed: "영구 승인을 불러올 수 없습니다.",
    revokeFailed: "취소할 수 없습니다. 다시 시도하세요.",
    notHeld: "더 이상 적용되지 않음",
    engineNative: "네이티브 엔진",
    engineClaudeCode: "Claude Code",
    sandboxDisabled: "샌드박스 밖"
  }
} satisfies Translation<'chatA-tools'>
