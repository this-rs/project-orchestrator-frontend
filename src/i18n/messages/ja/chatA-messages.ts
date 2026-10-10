import type { Translation } from '../../catalog.ts'

export default {
  copy: {
    title: "Markdown としてコピー",
    copied: "コピーしました",
    popupTitle: "メッセージの Markdown"
  },
  compact: {
    label: "コンテキストを圧縮しました",
    trigger: {
      auto: "自動",
      manual: "手動"
    },
    tokens: "約 {count}K トークン"
  },
  continued: {
    label: "継続しました",
    afterOne: "{count} ターン後",
    afterMany: "{count} ターン後"
  },
  bubble: {
    references: "参照",
    attachments: "添付ファイル",
    copyMessage: "メッセージを Markdown としてコピー",
    copyReply: "返信を Markdown としてコピー",
    thinking: "考え中..."
  },
  list: {
    loading: "メッセージを読み込み中...",
    loadingOlder: "以前のメッセージを読み込み中...",
    beginning: "— 会話の始まり —",
    loadingNewer: "新しいメッセージを読み込み中...",
    scrollMore: "— 下にスクロールするとさらに表示 —",
    catchingUp: "追いついています…",
    newActivity: "新しいアクティビティ ↓"
  },
  compaction: {
    label: "コンテキストを圧縮中"
  },
  welcome: {
    title: "Project Orchestrator",
    subtitle: "何をしますか？",
    quickActions: "クイックアクション",
    selectProject: "クイックアクションを使うには上でプロジェクトを選択してください",
    projectStatus: "プロジェクトの状態",
    activePlanOne: "{count} 件のアクティブなプラン",
    activePlanMany: "{count} 件のアクティブなプラン",
    toReview: "{count} 件が要確認",
    allClear: "問題なし",
    notesOne: "{count} 件のノート",
    notesMany: "{count} 件のノート",
    synced: "{when}に同期",
    untitled: "無題",
    untitledConversation: "無題の会話",
    recent: "最近の会話",
    actions: {
      next: {
        label: "次のタスク",
        description: "次に着手できるタスクを取得",
        prompt: "アクティブなプランで次に着手できるタスクは何ですか？ そのコンテキストと手順を見せてください。"
      },
      plan: {
        label: "何かを計画",
        description: "実装を計画",
        prompt: "次の実装を計画してください: "
      },
      impact: {
        label: "影響分析",
        description: "変更の影響を分析",
        prompt: "次を変更した場合の影響を分析してください: "
      },
      arch: {
        label: "アーキテクチャ",
        description: "コードベースの概要",
        prompt: "プロジェクトのアーキテクチャの概要を教えてください"
      },
      search: {
        label: "コード検索",
        description: "コードベース内を検索",
        prompt: "次をコード内で検索してください: "
      },
      roadmap: {
        label: "ロードマップ",
        description: "マイルストーンとリリース",
        prompt: "マイルストーンとリリースを含む完全なロードマップを見せてください"
      }
    },
    time: {
      now: "たった今",
      minutes: "{count} 分前",
      hours: "{count} 時間前",
      days: "{count} 日前",
      months: "{count} か月前"
    },
    plan: {
      draft: "下書き",
      approved: "承認済み",
      in_progress: "進行中",
      completed: "完了",
      cancelled: "キャンセル済み"
    }
  },
  panel: {
    connected: "接続済み",
    reconnecting: "再接続中…",
    disconnected: "切断",
    connectionLost: "接続が切れました",
    exportTitle: "チャットのエクスポート",
    newChatTitle: "新しいチャット",
    chatTitle: "チャット",
    conversations: "会話",
    newConversation: "新しい会話",
    backToChat: "チャットに戻る",
    sessions: "セッション",
    newChat: "新しいチャット",
    assistantTree: "アシスタントツリー",
    permissionSettings: "権限設定",
    copied: "コピーしました",
    copyChat: "チャットを Markdown としてコピー",
    exitFullscreen: "全画面を終了",
    close: "閉じる",
    backToParent: "親に戻る",
    actions: "会話の操作",
    attach: "プランまたはタスクに関連付け…",
    hideTree: "アシスタントツリーを隠す",
    showTree: "アシスタントツリーを表示",
    fullscreen: "全画面",
    noProjectsTitle: "プロジェクトがまだありません",
    noProjectsBody: "このワークスペースにプロジェクトを追加して、Claude との会話を始めましょう。",
    addProject: "プロジェクトを追加"
  }
} satisfies Translation<'chatA-messages'>
