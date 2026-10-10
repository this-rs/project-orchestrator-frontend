import type { Translation } from '../../catalog.ts'

export default {
  title: "워크스페이스 선택",
  lead: "워크스페이스는 컨텍스트와 목표를 공유하는 프로젝트를 묶습니다. 작업할 워크스페이스를 선택하세요.",
  notFound: "워크스페이스 \"{slug}\"을(를) 찾을 수 없습니다",
  notFoundBody: "삭제되었거나 이름이 바뀌었을 수 있습니다. 아래에서 다른 워크스페이스를 선택하세요.",
  loading: "워크스페이스 불러오는 중",
  errorTitle: "연결 오류",
  errorBody: "워크스페이스를 불러오지 못했습니다. 백엔드가 실행 중인가요?",
  create: "워크스페이스 만들기",
  createSubmit: "만들기",
  creating: "만드는 중…",
  cancel: "취소",
  nameLabel: "워크스페이스 이름",
  namePlaceholder: "내 워크스페이스",
  welcome: "Project Orchestrator에 오신 것을 환영합니다",
  welcomeLead: "첫 워크스페이스를 만들어 시작하세요.",
  createFirst: "워크스페이스 만들기",
  createFailed: "워크스페이스를 만들지 못했습니다",
  updated: "업데이트",
  explain: {
    what: "워크스페이스는 컨텍스트와 목표를 공유하는 여러 프로젝트를 묶습니다.",
    why: "워크스페이스를 열면 프로젝트, 계획, 노트, 결정을 한눈에 볼 수 있고, 오늘 화면에서는 모든 워크스페이스에서 기다리는 일을 확인할 수 있습니다.",
    different: "프로젝트마다 서로 연결 없는 폴더를 두는 대신, 워크스페이스의 프로젝트는 결정된 내용을 공유하므로 한 프로젝트를 맡은 어시스턴트가 다른 프로젝트에서 정해진 것을 압니다.",
  },
} satisfies Translation<'workspaceSelector'>
