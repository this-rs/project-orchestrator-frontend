import type { Translation } from '../../catalog.ts'

export default {
  componentTypes: {
    service: 'サービス',
    frontend: 'フロントエンド',
    worker: 'ワーカー',
    database: 'データベース',
    message_queue: 'キュー',
    cache: 'キャッシュ',
    gateway: 'ゲートウェイ',
    external: '外部',
    library: 'ライブラリ',
    cli: 'CLI',
    other: 'その他',
  },
  tiers: {
    entry: 'エントリーポイント',
    gateway: 'ゲートウェイ',
    services: 'サービス',
    libraries: 'ライブラリ、メッセージング、キャッシュ',
    data: 'データと外部',
    other: 'その他',
  },
  legend: {
    required: '必須',
    optional: '任意 — なくてもシステムは動作します',
    direction: '左から右へ：ユーザーの入口 → サービス → データ',
    select: 'コンポーネントを選択すると、停止した場合の影響範囲を確認できます',
  },
  panel: {
    details: '{name} の詳細',
    close: '詳細を閉じる',
    optional: '任意',
    dependedOnBy: '依存されている ({n})',
    dependsOn: '依存先 ({n})',
    nothingDependsOnThis: 'これに依存するものはありません。',
    dependsOnNothing: '依存先はありません。',
    derivedFrom: '{source} から導出',
  },
  description: '構築されたままのシステム：コンポーネントとその依存関係。',
  loadFailed: 'アーキテクチャを読み込めませんでした',
  emptyTitle: 'アーキテクチャはまだありません',
  emptyDescription:
    'ワークスペースにコンポーネント（サービス、データベース、キュー…）を追加するか、アシスタントにシステムのマッピングを依頼してください。',
  graphLabel: 'アーキテクチャグラフ',
  outline: 'アーキテクチャの概要',
} satisfies Translation<'architecture'>
