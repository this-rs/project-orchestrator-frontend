import type { Translation } from '../../catalog.ts'

export default {
  summary: {
    waves: '웨이브:',
    maxParallel: '최대 병렬 수:',
    criticalPath: '크리티컬 패스:',
    tasks: '작업:',
    conflicts: '충돌 {count}건',
    viewRunner: 'Runner 보기',
    resume: '플랜 재개',
    launch: '플랜 시작',
  },
  card: {
    hideSteps: '{title}의 단계 숨기기',
    showSteps: '{title}의 단계 표시',
    working: '처리 중…',
    conflictOn: '충돌 파일: {files}',
    fileConflict: '파일 충돌',
    stepsDone: '{total}개 단계 중 {done}개 완료',
    sharedFile: '{file} — 이 웨이브의 다른 작업과 공유됨',
    loadingSteps: '단계를 불러오는 중…',
    verify: '검증: {text}',
    noSteps: '단계 없음',
    openTask: '작업 열기',
  },
  column: {
    wave: '웨이브 {number}',
    activeWave: '활성 웨이브',
    split: '분할됨',
    progress: '웨이브 {number}: 작업 {total}개 중 {done}개 완료',
  },
  none: '계산된 웨이브가 없습니다',
} satisfies Translation<'waves'>
