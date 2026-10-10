import type { Translation } from '../../catalog.ts'

export default {
  description: '実装フェーズを計画して追跡します',
  newPlan: '新しいプラン',
  searchPlaceholder: 'プランを検索…',
  allStatuses: 'すべてのステータス',
  project: 'プロジェクト',
  listLabel: 'プラン',
  selectPlan: '{title} を選択',
  createdBy: '作成者:{name}',
  loaded: '{total} 件中 {loaded} 件を読み込み済み',
  count: {
    one: '{count} 件のプラン',
    other: '{count} 件のプラン',
  },
  empty: {
    pristineTitle: 'プランはまだありません',
    pristineBody: 'プランを作成して、開発作業を整理しましょう。',
    filteredTitle: '一致するプランはありません',
    filteredBody: '検索条件やフィルターを調整してみてください。',
  },
  toast: {
    created: 'プランを作成しました',
    updated: 'プランを更新しました',
    deleted: 'プランを削除しました',
    deletedMany: {
      one: '{count} 件のプランを削除しました',
      other: '{count} 件のプランを削除しました',
    },
  },
  dialog: {
    create: 'プランを作成',
    edit: 'プランを編集',
  },
  confirm: {
    deleteTitle: 'プランを削除しますか?',
    deleteBody: 'このプランとそのすべてのタスクが完全に削除されます。',
    bulkTitle: {
      one: '{count} 件のプランを削除しますか?',
      other: '{count} 件のプランを削除しますか?',
    },
    bulkBody: {
      one: '{count} 件のプランとそのすべてのタスクが完全に削除されます。',
      other: '{count} 件のプランとそのすべてのタスクが完全に削除されます。',
    },
  },
} satisfies Translation<'plans'>
