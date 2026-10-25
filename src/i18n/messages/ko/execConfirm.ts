import type { Translation } from '../../catalog.ts'

export default {
  aria: '이 폴더에서 작업 실행 허용',
  title: '이 폴더에서 실행할까요?',
  hint: '답하기 전에는 아무것도 시작되지 않습니다. 허용은 본인만 할 수 있습니다.',
  allow: '허용',
  reject: '거부',
  state: {
    confirmed: '확인됨: 작업이 시작됩니다.',
    rejected: '거부됨: 아무것도 실행되지 않았습니다.',
    expired: '만료됨: 위임을 다시 요청하세요.',
  },
  error: {
    forbidden: '이 요청에는 소유자만 응답할 수 있습니다.',
    conflict: '이 요청은 이미 응답되었거나 더 이상 일치하지 않습니다.',
    other: '응답을 보내지 못했습니다',
  },
} satisfies Translation<'execConfirm'>
