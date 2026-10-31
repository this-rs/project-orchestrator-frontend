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
    openAttachment: "{name} を開く",
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
  spawn: {
    runner: "ランナー",
    conversation: "派生",
    delegation: "委任",
    pipeline: "パイプライン",
    gate: "ゲート",
    trigger: "トリガー",
    mirrorClaudeCode: "サブエージェント (Claude Code)",
    subagentOf: "別の会話のサブエージェント"
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
      },
      prepare: {
        label: "何かを準備する",
        description: "イベント、ファイル、立ち上げ",
        prompt: "次のことを、依存関係を含むタスク計画として準備するのを手伝ってください: "
      },
      track: {
        label: "何かを記録する",
        description: "予算、スケジュール、リスト",
        prompt: "次のことを記録する方法を用意してください: タスク付きの計画、伝えたことのメモ、選ぶたびの決定。記録する内容はこちら: "
      },
      resume: {
        label: "止まった作業を再開する",
        description: "待機中の作業を再開",
        prompt: "止まっている、または私を待っているものは何ですか？ 一覧にし、最初の項目を再開してください。"
      },
      decided: {
        label: "何を決めましたか？",
        description: "決定とその理由",
        prompt: "これまでに何を、なぜ決めましたか？ 決定をその理由と除外した代替案とともに一覧にしてください。"
      },
      standing: {
        label: "どこまで進みましたか？",
        description: "目的、計画、進捗",
        prompt: "どこまで進んでいるか見せてください: 目的、計画、完了したこと、次に来るもの。"
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
    mirrorBanner: "Claude Code サブエージェントの読み取り専用ミラー",
    actions: "会話の操作",
    attach: "プランまたはタスクに関連付け…",
    hideTree: "アシスタントツリーを隠す",
    showTree: "アシスタントツリーを表示",
    fullscreen: "全画面",
    noProjectsTitle: "プロジェクトがまだありません",
    noProjectsBody: "このワークスペースにプロジェクトを追加して、Claude との会話を始めましょう。",
    addProject: "プロジェクトを追加"
  },
  attachment: {
    download: "ダウンロード",
    noPreview: "この形式はここでは表示できません — ファイルはダウンロードできます。",
    noText: "このファイルからテキストを抽出できませんでした — ダウンロードはできます。",
    loadFailed: "ファイルを読み込めませんでした。",
    truncated: "プレビューは先頭 {chars} 文字までです — 続きはファイルをダウンロードしてください。",
  },
} satisfies Translation<'chatA-messages'>
