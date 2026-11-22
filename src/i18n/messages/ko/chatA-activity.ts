import type { Translation } from '../../catalog.ts'

export default {
  kindName: {
    run: "실행",
    workflow: "워크플로",
    agent: "에이전트",
    shell: "셸",
    monitor: "모니터"
  },
  kindCount: {
    run: {
      one: "실행 {count}개",
      many: "실행 {count}개"
    },
    workflow: {
      one: "워크플로 {count}개",
      many: "워크플로 {count}개"
    },
    agent: {
      one: "에이전트 {count}개",
      many: "에이전트 {count}개"
    },
    shell: {
      one: "셸 {count}개",
      many: "셸 {count}개"
    },
    monitor: {
      one: "모니터 {count}개",
      many: "모니터 {count}개"
    }
  },
  row: {
    progress: "에이전트 {settled}/{total}",
    stopping: "중지하는 중…",
    stoppingTitle: "중지하는 중…",
    stop: "중지",
    stopAria: "{title} 중지",
    stopRun: "이 실행 중지",
    show: "대화에서 보기",
    showAria: "대화에서 {title} 보기",
    openConversation: "해당 대화 열기",
    openConversationAria: "{title}의 대화 열기",
    dashboard: "러너 대시보드 열기",
    dashboardAria: "{title}의 러너 대시보드 열기"
  },
  bar: {
    acknowledge: "이 작업을 확인함 — 다음 요청 허용",
    runningAria: "실행 중: {summary}",
    stoppedOne: "{count}개 프로세스에 대한 신호가 수락되었습니다. 아직 실행 중일 수 있습니다.",
    stoppedMany: "{count}개 프로세스에 대한 신호가 수락되었습니다. 아직 실행 중일 수 있습니다.",
    noPid: "이 작업에 대한 신호가 확인되지 않았습니다. 결과를 알 수 없으므로 해당 활동을 확인하세요."
  },
  cancelAll: {
    open: "이 세션과 하위 에이전트의 도구 중지",
    explain: "이 세션의 모든 도구 프로세스에 중단 신호를 보내지만 턴은 계속됩니다. 프로세스가 신호를 무시하거나 계속 실행될 수 있습니다. 이후 실제 상태를 확인하세요. 하위 에이전트의 도구 프로세스도 하위 프로세스인 경우 영향을 받을 수 있으며 일부는 계속 실행될 수 있습니다.",
    confirm: "세션과 하위 에이전트의 도구에 중단 신호 보내기",
    back: "돌아가기",
    sending: "중단 신호 보내는 중…",
    signalled: "한 소유자로부터 응답을 받았습니다. 신호가 프로세스 중지를 보장하지 않으며 다른 작업이 계속 진행 중일 수 있습니다. 세션 활동을 확인하세요.",
    capped: "한 소유자가 속도 제한을 보고했습니다. 다른 소유자가 계속 동작할 수 있으므로 다시 시도하기 전에 세션을 확인하세요.",
    uncertain: "결과를 알 수 없습니다. 신호가 나중에 전송될 수 있으므로 다시 시도하기 전에 세션을 확인하세요.",
    refused: "한 엔진에서 거부 응답을 받았습니다.",
    unsupported: "이 제공자는 이 세션의 모든 도구를 중지할 수 없습니다.",
    ownerUnreachable: "소유자에게 연결할 수 없어 중지가 확인되지 않았습니다. 세션 활동을 확인하세요.",
    identityChanged: "인증된 신원을 확인할 수 없어 요청을 보내지 않았습니다. 세션을 확인하고 필요한 경우 다시 로그인하세요.",
    reset: "이 세션을 확인했습니다 — 다른 요청 허용",
  },
  cancel: {
    unsupportedNotice: "거부 응답을 받았지만 중지 상태는 확인되지 않았습니다. 세션 활동을 확인하세요.",
    unknownNotice: "이 중지 요청의 결과를 알 수 없습니다. 세션 활동을 확인하세요.",
    retryNotice: "결과가 확인되지 않았습니다. 이 작업의 중지를 다시 시도하기 전에 활동을 확인하세요.",
    timeoutNotice: "중지 요청에 제때 응답이 없었습니다. 중지가 아직 일어날 수 있습니다.",
    taskRefusedNotice: "거부 응답을 받았지만 중지 상태는 확인되지 않았습니다. 세션 활동을 확인하세요.",
    unauthenticatedNotice: '인증이 거부되었습니다(401): 로그인되어 있지 않거나 만료되었습니다. 중지가 확인되지 않았습니다. 다시 로그인한 뒤 세션 활동을 확인하세요.',
    forbiddenNotice: '권한이 거부되었습니다(403): 이 계정은 이 도구들을 중지할 수 없습니다. 중지가 확인되지 않았습니다. 세션 활동을 확인하세요.',
  },
  stopDialog: {
    title: "이 세션의 도구 중지",
    description: "확인하기 전에는 아무것도 전송되지 않습니다. 계속 실행할 항목은 체크를 해제하세요.",
    empty: "개별 활동이 없습니다. 확인하면 포그라운드 도구를 포함해 세션의 모든 도구가 중지됩니다.",
    selected: "{total}개 중 {selected}개 선택됨",
    quick: {
      label: "빠른 선택",
      all: "전체",
      none: "없음",
      onlyOld: "오래된 것만",
      onlyOldHint: "시작된 지 {minutes}분 미만인 항목의 체크를 해제합니다",
      keepBackground: "백그라운드 작업 유지",
      keepMonitors: "모니터 유지",
      keepAgents: "하위 에이전트 유지",
    },
    group: { agent: "하위 에이전트", background: "백그라운드 작업", monitor: "모니터", other: "기타" },
    age: { unknown: "경과 시간 알 수 없음", lessThanMinute: "1분 미만", minutes: "{count}분째", hours: "{count}시간째" },
    alreadyRequested: "이 작업의 중지가 이미 요청되었습니다.",
    foregroundWarning: "포그라운드 도구는 중지되지 않습니다. 개별 식별자가 없기 때문입니다. 「전체」만 이를 중지합니다.",
    untargetableWarning: "개별로 중지할 수 없는 체크된 항목(하위 에이전트, 실행): {count}개. 전체를 체크하지 않으면 계속 실행됩니다.",
    confirmOne: "{count}개 항목 중지",
    confirmMany: "{count}개 항목 중지",
    cancel: "취소",
    close: "닫기",
    resultsIntro: "항목별 결과입니다. 신호가 프로세스 중지를 보장하지는 않습니다.",
    results: "항목별 결과",
  },
  agent: {
    subAgent: "하위 에이전트",
    toolOne: "도구 {count}개",
    toolMany: "도구 {count}개",
    running: "{count}개 실행 중",
    runningIndicator: "에이전트 실행 중..."
  },
  status: {
    spawning: "시작 중",
    running: "실행 중",
    verifying: "검증 중",
    completed: "완료됨",
    failed: "실패",
    interrupted: "중단됨"
  },
  banner: {
    elapsed: "경과 시간",
    cost: "비용",
    ram: "RAM(상주)",
    cpu: "CPU",
    pidTitle: "PID {pid} · 스레드 {threads}개 · {status}",
    viewAgent: "이 에이전트의 대화 보기",
    view: "보기",
    interrupt: "이 에이전트 중단",
    runTitle: "실행 {id}",
    runShort: "실행 {id}",
    wave: "웨이브 {wave}",
    openDashboard: "전체 러너 대시보드 열기",
    dashboard: "대시보드",
    spawning: "에이전트를 시작하는 중…",
    noAgents: "활성 에이전트 없음",
    title: "에이전트 모드",
    activeOne: "활성 실행 {count}개",
    activeMany: "활성 실행 {count}개",
    cumulative: "누적 {cost}"
  },
  pill: {
    title: "에이전트 모드",
    state: {
      idle: "유휴",
      ready: "준비됨",
      running: "실행 중",
      completed: "완료됨"
    },
    workingOne: "에이전트 모드 — 에이전트 {count}개 작업 중",
    workingMany: "에이전트 모드 — 에이전트 {count}개 작업 중",
    completedOne: "에이전트 모드 — 실행 {count}개 완료",
    completedMany: "에이전트 모드 — 실행 {count}개 완료",
    ready: "에이전트 모드 — 준비됨",
    streamingOne: "현재 실행 {count}개가 스트리밍 중입니다. 아래 배너에 에이전트가 실시간으로 표시됩니다.",
    streamingMany: "현재 실행 {count}개가 스트리밍 중입니다. 아래 배너에 에이전트가 실시간으로 표시됩니다.",
    more: "외 {count}개",
    readyNote: "이 채팅에 연결된 플랜이 있지만 현재 스트리밍 중인 플랜은 없습니다.",
    ranOne: "이 채팅에서 실행 {count}개가 수행되었습니다. 현재 스트리밍 중인 것은 없습니다.",
    ranMany: "이 채팅에서 실행 {count}개가 수행되었습니다. 현재 스트리밍 중인 것은 없습니다.",
    openDashboard: "러너 대시보드 열기"
  },
  bg: {
    title: "백그라운드 활동",
    listAria: "백그라운드 활동 목록",
    noWork: "공급자 알림만 있음",
    noticeOne: "공급자 알림 {count}개",
    noticeMany: "공급자 알림 {count}개",
    noticesAria: "공급자 알림 — 텔레메트리, 작업 없음",
    summary: {
      running: "{count}개 실행 중",
      queued: "{count}개 대기 중",
      failed: "{count}개 실패",
      done: "{count}개 완료",
      cancelled: "{count}개 취소됨",
      ended: "{count}개 종료됨"
    }
  },
  card: {
    showMore: "더 보기",
    showLess: "접기",
    lineOne: "{count}줄",
    lineMany: "{count}줄",
    earlierLineOne: "이전 {count}줄 보기",
    earlierLineMany: "이전 {count}줄 보기",
    progressOf: "{title} 진행률",
    agents: "에이전트 {settled}/{total}",
    agentsOf: "{title}의 에이전트",
    tokens: "토큰 {count}개",
    toolUseOne: "도구 사용 {count}회",
    toolUseMany: "도구 사용 {count}회",
    timeline: "타임라인",
    eventOne: "이벤트 {count}개",
    eventMany: "이벤트 {count}개",
    eventsOf: "{title}의 이벤트",
    hiddenEventOne: "… 이전 이벤트 {count}개는 보관되지 않음",
    hiddenEventMany: "… 이전 이벤트 {count}개는 보관되지 않음",
    rawPayload: "원시 페이로드",
    parameters: "매개변수",
    latestOutput: "최근 출력",
    output: "출력",
    result: "결과",
    watched: "감시 중인 출력",
    outputInFile: "출력은 작업 파일(위)로 갔으며 공급자는 스트림으로 보내지 않습니다.",
    toolsAria: "호출한 도구",
    kind: {
      workflow: "워크플로",
      shell: "백그라운드 명령",
      monitor: "모니터",
      agent: "하위 에이전트",
      message: "백그라운드 에이전트",
      notice: "공급자 알림",
      generic: "백그라운드 활동"
    },
    status: {
      running: "실행 중",
      queued: "대기 중",
      done: "완료",
      failed: "실패",
      cancelled: "취소됨",
      ended: "종료됨"
    }
  },
  runs: {
    finished: "종료됨",
    view: "실행 보기",
    stop: "실행 중지",
    loading: "실행 내역을 불러오는 중…",
    noDetails: "사용할 수 있는 실행 세부 정보가 없습니다.",
    inProgressOne: "진행 중인 실행 {count}개",
    inProgressMany: "진행 중인 실행 {count}개",
    completedOne: "완료된 실행 {count}개",
    completedMany: "완료된 실행 {count}개",
    done: "{count}개 완료"
  },
  work: {
    kind: {
      plan: "플랜",
      task: "작업"
    },
    steps: "단계 {done}/{total}",
    openPlan: "플랜 {title} 열기",
    openTask: "작업 {title} 열기",
    plans: {
      one: "플랜 {count}개",
      many: "플랜 {count}개"
    },
    tasks: {
      one: "작업 {count}개",
      many: "작업 {count}개"
    },
    barAria: "진행 중: {summary}",
    barAriaCurrent: "진행 중: {summary} — 현재 작업: {title}"
  }
} satisfies Translation<'chatA-activity'>
