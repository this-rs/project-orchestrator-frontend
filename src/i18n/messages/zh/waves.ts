import type { Translation } from '../../catalog.ts'

export default {
  summary: {
    waves: '波次:',
    maxParallel: '最大并行数:',
    criticalPath: '关键路径:',
    tasks: '任务:',
    conflicts: '{count} 个冲突',
    viewRunner: '查看 runner',
    resume: '继续计划',
    launch: '启动计划',
  },
  card: {
    hideSteps: '隐藏 {title} 的步骤',
    showSteps: '显示 {title} 的步骤',
    working: '处理中…',
    conflictOn: '冲突文件:{files}',
    fileConflict: '文件冲突',
    stepsDone: '{total} 个步骤中已完成 {done} 个',
    sharedFile: '{file} — 与此波次中的另一个任务共用',
    loadingSteps: '正在加载步骤…',
    verify: '验证:{text}',
    noSteps: '暂无步骤',
    openTask: '打开任务',
  },
  column: {
    wave: '波次 {number}',
    activeWave: '当前波次',
    split: '已拆分',
    progress: '波次 {number}:{total} 个任务中已完成 {done} 个',
  },
  none: '尚未计算波次',
} satisfies Translation<'waves'>
