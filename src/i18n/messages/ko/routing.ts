import type { Translation } from '../../catalog.ts'

export default {
  modes: {
    primary: { label: '기본만', description: '배타적인 기본 프로바이더 하나만 사용합니다(현재 방식). PO는 선택했을 결과를 기록만 합니다.' },
    mixed: { label: '혼합', description: '기본 프로바이더가 대화를 이끌고, PO가 실행자를 배정합니다.' },
    full: { label: '전체', description: 'PO가 모든 것을 선택하고 이유를 설명합니다.' },
  },
  stages: {
    shadow: { label: '섀도', description: '아무것도 적용하지 않고 모든 결정을 기록합니다.' },
    advisory: { label: '권고', description: 'PO가 제안하고 사용자가 확인합니다.' },
    auto: { label: '자동', description: 'PO가 결정을 그대로 적용합니다.' },
  },
  routedBy: {
    session: '세션용으로 선택됨',
    request: '요청에서 선택됨',
    task: '작업에서 선택됨',
    persona: '페르소나에서 선택됨',
    run: '실행에서 선택됨',
    project_rule: '프로젝트 규칙',
    global_rule: '전역 규칙',
    default: '서버 기본값',
    claude_code: 'Claude Code 대체',
    fallback: '대체 체인',
    auto: 'PO가 선택함',
  },
  rejection: {
    not_allowed: '이 프로젝트에서 허용되지 않음',
    unhealthy: '비정상',
    no_tools: '도구를 호출할 수 없음',
    context_too_small: '컨텍스트 창이 너무 작음',
    no_images: '이미지를 읽을 수 없음',
    over_budget: '예산 초과',
    trust_without_sandbox: '샌드박스 없는 신뢰 모드',
    remote: '원격, 여기서는 허용되지 않음',
  },
  badge: { poChooses: 'PO가 선택', why: '이유' },
  advanced: { force: '고급: 이 대화에 프로바이더/모델 강제 지정' },
  picker: { primary: '기본: {target} · PO가 실행자를 라우팅', forced: '강제됨: {target}', willChoose: '첫 메시지에서 PO가 선택합니다', routedBy: '라우팅 주체: {by}', aria: '라우팅: {mode}' },
  reason: '이유: {reason}',
  settings: { title: '라우팅', confirmAuto: '앞으로 PO가 묻지 않고 자신의 선택을 적용합니다. 계속할까요?' },
  report: { agreement: '실제 선택과의 일치율', costDelta: '예상 비용 차이', unknown: '알 수 없음' },
} satisfies Translation<'routing'>
