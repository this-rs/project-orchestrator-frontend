import type { Translation } from '../../catalog.ts'

export default {
  layer: {
    code: { label: 'コード', description: 'ファイル、関数、構造体、トレイト' },
    pm: { label: 'プロジェクト', description: 'プラン、タスク、マイルストーン' },
    knowledge: { label: 'ナレッジ', description: 'ノート、決定事項、制約' },
    fabric: { label: 'ファブリック', description: 'IMPORTS、CALLS、CO_CHANGED' },
    neural: { label: 'ニューラル', description: 'シナプス、エネルギー、活性化' },
    skills: { label: 'スキル', description: '自然に形成される知識のまとまり' },
    behavioral: { label: '振る舞い', description: 'プロトコル、状態、遷移（FSM）' },
    chat: { label: 'チャット', description: 'チャットセッションと話題に上ったエンティティ' },
  },
  preset: {
    code_only: { label: 'コード', description: 'コードのアーキテクチャのみ' },
    knowledge_overlay: { label: 'ナレッジ', description: 'コード上のノートと決定事項' },
    neural_view: { label: 'ニューラル', description: 'ニューラルネットワーク、スキル、プロトコル' },
    pm_view: { label: 'プロジェクト', description: 'プラン、タスク、マイルストーン' },
    impact_mode: { label: '影響', description: '影響分析' },
    behavioral_view: { label: '振る舞い', description: 'プロトコル、スキル、ノート、相互のつながり' },
    full_stack: { label: 'すべて', description: 'すべてのレイヤー' },
  },
  group: {
    core: 'コア',
    code: 'コード',
    knowledge: 'ナレッジ',
    git: 'Git',
    sessions: 'セッション',
    features: '機能',
    behavioral: '振る舞い',
  },
  scale: { workspace: 'プロジェクト', project: 'プラン + マイルストーン', plan: 'タスク', task: 'ステップ' },
} satisfies Translation<'intelConfig'>
