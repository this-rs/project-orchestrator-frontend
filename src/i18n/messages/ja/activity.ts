import type { Translation } from '../../catalog.ts'

export default {
  status: {
    running: '実行中',
    queued: '待機中',
    done: '完了',
    failed: '失敗',
    cancelled: 'キャンセル済み',
    ended: '終了',
  },
  lifecycle: {
    started: '開始',
    progress: '進行状況',
    updated: '更新',
    finished: '終了',
  },
  param: {
    agent: 'エージェント',
    workflow: 'ワークフロー',
    task: 'タスク',
    tool: 'ツール',
    model: 'モデル',
    exitCode: '終了コード',
    taskId: 'タスク ID',
    outputFile: '出力ファイル',
  },
  title: {
    workflow: 'ワークフロー',
    shell: 'バックグラウンドコマンド',
    monitor: 'モニター',
    agent: 'サブエージェント',
  },
} satisfies Translation<'activity'>
