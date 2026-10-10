import type { Translation } from '../../catalog.ts'

export default {
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
    }
  },
  permission: {
    actions: "이 권한 요청에 응답",
    allowOnce: "한 번 허용",
    allowSession: "이 세션 동안",
    allowAlways: "항상",
    deny: "거부",
    sessionHint: "이 대화에서는 다시 묻지 않음",
    alwaysHint: "이 프로젝트에서는 재시작 후에도 다시 묻지 않음",
    allowed: "허용됨",
    allowedSession: "세션 동안 허용됨",
    allowedAlways: "항상 허용됨",
    denied: "거부됨"
  }
} satisfies Translation<'chatA-tools'>
