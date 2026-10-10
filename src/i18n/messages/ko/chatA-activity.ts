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
    tooFast: "취소가 너무 빠릅니다. 잠시 후 다시 시도하세요.",
    cancelFailed: "작업을 취소하지 못했습니다. 대신 전체 중지를 사용하세요.",
    runningAria: "실행 중: {summary}",
    stoppedOne: "하위 프로세스 {count}개를 중지했습니다.",
    stoppedMany: "하위 프로세스 {count}개를 중지했습니다.",
    noPid: "취소는 등록되었지만 하위 프로세스의 PID를 알 수 없었습니다. 신호가 계속 도착하면 전체 중지 버튼을 사용하세요."
  },
  cancel: {
    alreadyStopped: "이미 중지됨",
    notStopped: "중지되지 않음",
    alreadyStoppedNotice: "이미 중지되었습니다. 더 이상 실행 중인 것이 없었습니다.",
    retryNotice: "아직 중지되지 않았습니다. 잠시 후 다시 시도하세요.",
    timeoutNotice: "중지 요청에 제때 응답이 없었습니다. 중지가 아직 일어날 수 있습니다.",
    failedNotice: "도구를 중지하지 못했습니다. 대신 전체 중지를 사용하세요."
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
    kind: {
      workflow: "워크플로",
      shell: "백그라운드 명령",
      monitor: "모니터",
      agent: "하위 에이전트",
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
  }
} satisfies Translation<'chatA-activity'>
