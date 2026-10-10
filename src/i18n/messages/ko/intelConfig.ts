import type { Translation } from '../../catalog.ts'

export default {
  layer: {
    code: { label: '코드', description: '파일, 함수, 구조체, 트레이트' },
    pm: { label: '프로젝트', description: '플랜, 작업, 마일스톤' },
    knowledge: { label: '지식', description: '노트, 결정, 제약' },
    fabric: { label: '패브릭', description: 'IMPORTS, CALLS, CO_CHANGED' },
    neural: { label: '뉴럴', description: '시냅스, 에너지, 활성화' },
    skills: { label: '스킬', description: '자연 발생한 지식 클러스터' },
    behavioral: { label: '행동', description: '프로토콜, 상태, 전이(FSM)' },
    chat: { label: '채팅', description: '채팅 세션과 논의된 요소' },
  },
  preset: {
    code_only: { label: '코드', description: '순수한 코드 아키텍처' },
    knowledge_overlay: { label: '지식', description: '코드 위의 노트와 결정' },
    neural_view: { label: '뉴럴', description: '뉴럴 네트워크, 스킬, 프로토콜' },
    pm_view: { label: '프로젝트', description: '플랜, 작업, 마일스톤' },
    impact_mode: { label: '영향', description: '영향 분석' },
    behavioral_view: { label: '행동', description: '프로토콜, 스킬, 노트와 그 상호 연결' },
    full_stack: { label: '전체', description: '모든 레이어' },
  },
  group: {
    core: '코어',
    code: '코드',
    knowledge: '지식',
    git: 'Git',
    sessions: '세션',
    features: '기능',
    behavioral: '행동',
  },
  scale: { workspace: '프로젝트', project: '플랜 + 마일스톤', plan: '작업', task: '단계' },
} satisfies Translation<'intelConfig'>
