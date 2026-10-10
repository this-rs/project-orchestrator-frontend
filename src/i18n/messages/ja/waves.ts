import type { Translation } from '../../catalog.ts'

export default {
  summary: {
    waves: 'ウェーブ:',
    maxParallel: '最大並列数:',
    criticalPath: 'クリティカルパス:',
    tasks: 'タスク:',
    conflicts: '{count} 件の競合',
    viewRunner: 'Runner を表示',
    resume: 'プランを再開',
    launch: 'プランを起動',
  },
  card: {
    hideSteps: '{title} のステップを非表示',
    showSteps: '{title} のステップを表示',
    working: '処理中…',
    conflictOn: '競合するファイル:{files}',
    fileConflict: 'ファイルの競合',
    stepsDone: '{total} ステップ中 {done} ステップ完了',
    sharedFile: '{file} — このウェーブ内の別のタスクと共有',
    loadingSteps: 'ステップを読み込み中…',
    verify: '検証:{text}',
    noSteps: 'ステップはありません',
    openTask: 'タスクを開く',
  },
  column: {
    wave: 'ウェーブ {number}',
    activeWave: 'アクティブなウェーブ',
    split: '分割済み',
    progress: 'ウェーブ {number}:{total} 件中 {done} 件のタスクが完了',
  },
  none: 'ウェーブはまだ計算されていません',
} satisfies Translation<'waves'>
