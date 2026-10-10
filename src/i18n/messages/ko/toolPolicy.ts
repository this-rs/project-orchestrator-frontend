import type { Translation } from '../../catalog.ts'

export default {
  neutral: {
    trust: "Rock'n roll",
    auto_edits: '편집 자동 승인',
    ask: '묻기',
    plan_only: '플랜만',
  },
  composer: {
    trust: "Rock'n roll",
    auto_edits: '편집 수락',
    ask: '기본',
    plan_only: '플랜만',
  },
  session: {
    trust: "Rock'n roll",
    auto_edits: '편집 수락',
    ask: '권한 묻기',
    plan_only: '플랜 모드',
  },
  native: {
    auto: { short: '자동', long: '자동 모드' },
    dontAsk: { short: '묻지 않음', long: '묻지 않기' },
  },
  settings: {
    claude: {
      trust: { label: "Rock'n roll", description: '모든 도구를 자동 승인합니다. 확인 없음.' },
      auto_edits: { label: '편집 수락', description: '파일 편집은 자동 승인하고 명령은 확인합니다.' },
      ask: { label: '기본', description: '모든 도구 사용 시 확인합니다.' },
      plan_only: { label: '플랜만', description: '읽기 전용 모드. 쓰기나 명령 없음.' },
    },
    neutral: {
      trust: { description: '묻지 않고 모든 도구를 실행합니다.' },
      auto_edits: { description: '파일 편집은 묻지 않고 실행하고, 명령은 계속 묻습니다.' },
      ask: { description: '모든 도구 호출 전에 묻습니다.' },
      plan_only: { description: '읽기 전용. 쓰기나 명령 없음.' },
    },
  },
  setup: {
    trust: {
      label: "Rock'n roll",
      description: '모든 도구 자동 승인 — 권한 확인 없음',
      summary: "Rock'n roll (모두 자동 승인)",
    },
    ask: {
      label: '기본',
      description: '파일 편집과 셸 명령에 대해 승인을 요청합니다',
      summary: '기본 (편집 및 셸 확인)',
    },
    auto_edits: {
      label: '편집 수락',
      description: '파일 편집은 자동 승인, 셸 명령은 승인 필요',
      summary: '편집 수락 (셸만 확인)',
    },
    plan_only: {
      label: '플랜만',
      description: '읽기 전용 모드 — Claude는 파일을 읽을 수만 있고 수정할 수 없습니다',
      summary: '플랜만 (읽기 전용)',
    },
  },
  trustRequiresSandbox: '사용할 수 없음: 이 원격 머신은 이 모드를 허용하지 않습니다. 확인 없이 도구를 실행하려면 인스턴스 설정에서 활성화하세요.',
  rulesUnsupported: '허용 및 거부 규칙은 Claude Code 전용입니다. 이 제공자는 규칙을 적용하지 않으므로 표시하지 않습니다. 도구는 위의 권한 모드에 따라 제어됩니다.',
  trustDowngraded: '“Rock’n roll” 모드가 “묻기”로 바뀌었습니다. 이 원격 머신이 허용하지 않기 때문입니다.',
} satisfies Translation<'toolPolicy'>
