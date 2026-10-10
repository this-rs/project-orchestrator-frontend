import type { Translation } from '../../catalog.ts'

export default {
  summary: {
    waves: 'Đợt:',
    maxParallel: 'Song song tối đa:',
    criticalPath: 'Đường găng:',
    tasks: 'Tác vụ:',
    conflicts: '{count} xung đột',
    viewRunner: 'Xem runner',
    resume: 'Tiếp tục kế hoạch',
    launch: 'Chạy kế hoạch',
  },
  card: {
    hideSteps: 'Ẩn các bước của {title}',
    showSteps: 'Hiện các bước của {title}',
    working: 'Đang xử lý…',
    conflictOn: 'Xung đột trên: {files}',
    fileConflict: 'Xung đột tệp',
    stepsDone: '{done} trên {total} bước hoàn thành',
    sharedFile: '{file} — dùng chung với một tác vụ khác trong đợt này',
    loadingSteps: 'Đang tải các bước…',
    verify: 'Kiểm tra: {text}',
    noSteps: 'Không có bước',
    openTask: 'Mở tác vụ',
  },
  column: {
    wave: 'Đợt {number}',
    activeWave: 'Đợt đang hoạt động',
    split: 'đã tách',
    progress: 'Đợt {number}: {done} trên {total} tác vụ hoàn thành',
  },
  none: 'Chưa tính đợt nào',
} satisfies Translation<'waves'>
