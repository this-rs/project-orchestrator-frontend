import type { Translation } from '../../catalog.ts'

export default {
  agent: {
    asked: "サブエージェントへの依頼",
    kind: "エージェントの種類",
    answer: "その回答",
    failed: "サブエージェントが失敗しました",
    open: "サブ会話を開く",
    openTitle: "このサブエージェントが動いた会話を開く",
    running: "サブエージェントはまだ作業中です…",
    noChild: "サブ会話はまだ一覧にありません",
    noChildTitle: "子会話はこのツール呼び出しの識別子で見つけます。サーバーが一覧に載せ次第、表示されます。"
  },
  /** WebFetch / WebSearch: their result is data from the outside, never the assistant's text. */
  web: {
    externalSearch: "検索結果：外部のコンテンツです。アシスタントが書いたものではありません",
    externalPage: "ページの内容：外部のコンテンツです。アシスタントが書いたものではありません",
  },
  bash: {
    emptyCommand: "（空のコマンド）",
    showLess: "表示を減らす",
    showMore: "さらに {count} 文字を表示",
    noOutput: "出力なし",
    running: "実行中..."
  },
  default: {
    input: "入力",
    error: "エラー",
    result: "結果",
    truncated: "...（省略されました）"
  },
  edit: {
    replaceAll: "すべて置換",
    removedLineOne: "-{count} 行",
    removedLineMany: "-{count} 行",
    addedLineOne: "+{count} 行",
    addedLineMany: "+{count} 行",
    moreRemovedOne: "... ほか {count} 行を削除",
    moreRemovedMany: "... ほか {count} 行を削除",
    moreAddedOne: "... ほか {count} 行を追加",
    moreAddedMany: "... ほか {count} 行を追加",
    truncated: "...（省略されました）",
    editing: "編集中..."
  },
  chat: {
    you: "あなた",
    assistant: "アシスタント",
    messageOne: "{count} 件のメッセージ",
    messageMany: "{count} 件のメッセージ"
  },
  code: {
    copyPath: "パスをコピー",
    noResults: "結果なし",
    searchResults: "検索結果",
    noSymbols: "シンボルが見つかりません",
    noReferences: "参照が見つかりません",
    unknownFile: "（不明）",
    references: "参照",
    calledBy: "呼び出し元",
    calls: "呼び出し先",
    noCallGraph: "呼び出しグラフのデータがありません",
    callersColon: "呼び出し元:",
    dependentFiles: "依存ファイル",
    mostConnected: "最も接続の多いファイル",
    imports: "インポート",
    importedBy: "インポート元",
    label: {
      results: "結果",
      files: "ファイル",
      callers: "呼び出し元",
      callees: "呼び出し先",
      imports: "インポート",
      dependents: "依存元"
    },
    cat: {
      functions: "関数",
      structs: "構造体",
      enums: "列挙型",
      traits: "トレイト",
      impls: "impl",
      macros: "マクロ",
      constants: "定数",
      type_aliases: "型エイリアス"
    },
    symbols: {
      implementations: "実装",
      traits: "トレイト",
      impls: "impl ブロック"
    },
    symbolsNone: {
      implementations: "実装が見つかりません",
      traits: "トレイトが見つかりません",
      impls: "impl ブロックが見つかりません"
    }
  },
  entity: {
    project: "プロジェクト",
    created: "作成日",
    plan: "プラン",
    path: "パス",
    synced: "同期日",
    target: "目標",
    verify: "検証",
    tasks: "タスク",
    constraints: "制約",
    criteria: "受け入れ基準",
    steps: "ステップ",
    decisions: "決定事項",
    label: {
      tasks: "タスク",
      constraints: "制約",
      criteria: "基準",
      steps: "ステップ",
      decisions: "決定事項"
    },
    type: {
      plan: "プラン",
      task: "タスク",
      project: "プロジェクト",
      milestone: "マイルストーン",
      workspace: "ワークスペース",
      note: "ノート",
      release: "リリース"
    },
    view: {
      entity: "{entity}を表示",
      parentTask: "親タスクを表示",
      parentPlan: "親プランを表示",
      linkedTask: "関連タスクを表示",
      linkedPlan: "関連プランを表示"
    },
    deleted: "削除しました",
    updated: "更新しました",
    createdVerb: "作成しました",
    moreFields: "ほか {count} フィールド"
  },
  list: {
    untitledPlan: "無題のプラン",
    untitledSession: "無題のセッション",
    msgOne: "{count} 件",
    msgMany: "{count} 件",
    energy: "エネルギーレベル",
    target: "目標: {date}",
    noResults: "結果なし",
    resultOne: "{count} 件の結果",
    resultMany: "{count} 件の結果",
    matching: "「{query}」に一致"
  },
  viz: {
    noRadar: "利用できるレーダーデータがありません。",
    unknownTarget: "不明",
    direct: "直接（{count}）",
    transitive: "間接（{count}）",
    total: "合計 {count}",
    importance: {
      critical: "重大",
      high: "高",
      medium: "中",
      low: "低"
    },
    kind: {
      guideline: "ガイドライン",
      gotcha: "落とし穴",
      pattern: "パターン",
      context: "コンテキスト",
      tip: "ヒント",
      observation: "観察",
      assertion: "アサーション",
      decision: "決定"
    }
  },
  permission: {
    actions: "この許可リクエストに応答",
    allowOnce: "今回のみ許可",
    allowSession: "このセッション中",
    deny: "拒否",
    sessionHint: "この会話では同じ呼び出しを再確認しません",
    awaiting: "確認を待っています…",
    sessionCovers: "許可された場合、「このセッション中」の対象はこの呼び出しのみ:",
    forbidden: "この会話の所有者だけが回答できます。何も回答されていません。",
    ownerUnreadable: "この会話の所有者を確認できませんでした。何も回答されていません。もう一度お試しください。",
    unconfirmed: "確認が届きませんでした。もう一度回答してください。",
    scopeRefused: "この許可はセッション中保持できません（別のコマンドを実行する呼び出し、またはセッションが提供していません）。今回のみ許可するか拒否してください。",
    allowed: "許可済み",
    allowedSession: "セッション中は許可",
    denied: "拒否済み",
    allowAlways: "常に許可",
    alwaysHint: "このマシン上で、このプロジェクトのディレクトリで動く会話では、この呼び出しそのものについて再確認しません。会話がディレクトリを移動した場合は再確認します",
    alwaysCovers: "許可すると、「常に許可」が対象とするのは次のみです:",
    destinationHint: 'ネットワーク宛先です。許可の範囲はオーケストレーターが決め、回答すると提示されます',
    destinationCovers: 'この呼び出しの宛先:',
    destinationAlwaysHint: 'このプロジェクトのネットワーク同意として記録される場合があります。設定 → ネットワークツールで一覧表示と取り消しができます',
    destinationAlwaysCovers: '「常に」はこのプロジェクトのネットワーク同意として記録される場合があります（設定 → ネットワークツール）。',
    originQuestion: "このオリジンへのネットワークアクセスを許可しますか？",
    originScopes: "各回答の対象範囲",
    originOnce: "1回：この呼び出しのみ。何も保持されません。",
    originSession: "このセッション：このオリジンのすべてのページ、セッション終了まで。何も記録されません。",
    originSessionHint: "このオリジンのすべてのページ、このセッションの間",
    originAlways: "常に：このプロジェクトのネットワーク同意として次の対象に記録されます：",
    originAlwaysRevocable: "設定 → ネットワークツールに一覧表示され、取り消せます。",
    originAlwaysHint: "このプロジェクトのネットワーク同意として記録され、設定 → ネットワークツールで取り消せます",
    alwaysRefused: "この呼び出しは恒久的に許可できません(完全一致の読み取り、またはリダイレクトや連結のない読み取り専用コマンド1つのみ可能)。1回のみ、またはセッション中で回答してください。",
    allowedAlways: "常に許可済み"
  },
  lastingRules: {
    title: "常に許可された呼び出し",
    description: "恒久的に許可した呼び出し(プロジェクトごと)。それぞれ、このマシン上でプロジェクトのディレクトリで動く会話における、その呼び出しそのものだけが対象です。取り消すと、このマシンで次のリクエストから再び確認されます。",
    empty: "恒久的に許可された呼び出しはありません。",
    disabled: "このサーバーは恒久的な許可を保持しません。",
    revoke: "取り消す",
    revoked: "取り消しました: このマシンで次のリクエストから再び確認されます。",
    loadFailed: "恒久的な許可を読み込めませんでした。",
    revokeFailed: "取り消せませんでした。もう一度お試しください。",
    notHeld: "適用されなくなりました",
    engineNative: "ネイティブエンジン",
    engineClaudeCode: "Claude Code",
    sandboxDisabled: "サンドボックス外"
  }
} satisfies Translation<'chatA-tools'>
