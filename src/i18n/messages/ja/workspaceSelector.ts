import type { Translation } from '../../catalog.ts'

export default {
  title: "ワークスペースを選択",
  lead: "ワークスペースは、コンテキストと目標を共有するプロジェクトをまとめます。作業するワークスペースを選んでください。",
  notFound: "ワークスペース「{slug}」が見つかりません",
  notFoundBody: "削除または名前変更された可能性があります。下から別のものを選んでください。",
  loading: "ワークスペースを読み込み中",
  errorTitle: "接続エラー",
  errorBody: "ワークスペースを読み込めませんでした。バックエンドは起動していますか？",
  create: "ワークスペースを作成",
  createSubmit: "作成",
  creating: "作成中…",
  cancel: "キャンセル",
  nameLabel: "ワークスペース名",
  namePlaceholder: "マイワークスペース",
  welcome: "Project Orchestrator へようこそ",
  welcomeLead: "最初のワークスペースを作成して始めましょう。",
  createFirst: "ワークスペースを作成",
  createFailed: "ワークスペースを作成できませんでした",
  updated: "更新",
  explain: {
    what: "ワークスペースは、コンテキストと目標を共有する複数のプロジェクトをまとめます。",
    why: "ワークスペースを開くと、そのプロジェクト、計画、ノート、決定をまとめて確認でき、「今日」ではすべてのワークスペースであなたを待っているものが分かります。",
    different: "プロジェクトごとにバラバラのフォルダではなく、ワークスペース内のプロジェクトは決定事項を共有するため、一つに取り組むアシスタントは他のプロジェクトで決まったことを把握できます。",
  },
} satisfies Translation<'workspaceSelector'>
