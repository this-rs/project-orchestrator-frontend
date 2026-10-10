import type { Translation } from '../../catalog.ts'

export default {
  status: {
    running: '실행 중',
    queued: '대기 중',
    done: '완료',
    failed: '실패',
    cancelled: '취소됨',
    ended: '종료됨',
  },
  lifecycle: {
    started: '시작됨',
    progress: '진행 상황',
    updated: '업데이트됨',
    finished: '완료됨',
  },
  param: {
    agent: '에이전트',
    workflow: '워크플로',
    task: '작업',
    tool: '도구',
    model: '모델',
    exitCode: '종료 코드',
    taskId: '작업 ID',
    outputFile: '출력 파일',
  },
  title: {
    workflow: '워크플로',
    shell: '백그라운드 명령',
    monitor: '모니터',
    agent: '하위 에이전트',
  },
} satisfies Translation<'activity'>
