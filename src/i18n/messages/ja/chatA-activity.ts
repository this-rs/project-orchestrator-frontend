import type { Translation } from '../../catalog.ts'

export default {
  kindName: {
    run: "実行",
    workflow: "ワークフロー",
    agent: "エージェント",
    shell: "シェル",
    monitor: "モニター"
  },
  kindCount: {
    run: {
      one: "{count} 件の実行",
      many: "{count} 件の実行"
    },
    workflow: {
      one: "{count} 件のワークフロー",
      many: "{count} 件のワークフロー"
    },
    agent: {
      one: "{count} 件のエージェント",
      many: "{count} 件のエージェント"
    },
    shell: {
      one: "{count} 件のシェル",
      many: "{count} 件のシェル"
    },
    monitor: {
      one: "{count} 件のモニター",
      many: "{count} 件のモニター"
    }
  },
  row: {
    progress: "{settled}/{total} エージェント",
    stopping: "停止中…",
    stoppingTitle: "停止中…",
    stop: "停止",
    stopAria: "{title} を停止",
    stopRun: "この実行を停止",
    show: "会話内で表示",
    showAria: "{title} を会話内で表示",
    openConversation: "会話を開く",
    openConversationAria: "{title} の会話を開く",
    dashboard: "ランナーのダッシュボードを開く",
    dashboardAria: "{title} のランナーのダッシュボードを開く"
  },
  bar: {
    tooFast: "キャンセルが速すぎます。しばらくしてからもう一度お試しください。",
    cancelFailed: "タスクのキャンセルに失敗しました。代わりに全体の停止を使ってください。",
    runningAria: "実行中: {summary}",
    stoppedOne: "{count} 個のサブプロセスを停止しました。",
    stoppedMany: "{count} 個のサブプロセスを停止しました。",
    noPid: "キャンセルは登録されましたが、サブプロセスの PID が不明でした。更新が届き続ける場合は全体の停止ボタンを使ってください。"
  },
  agent: {
    subAgent: "サブエージェント",
    toolOne: "{count} 個のツール",
    toolMany: "{count} 個のツール",
    running: "{count} 件実行中",
    runningIndicator: "エージェントを実行中..."
  },
  status: {
    spawning: "起動中",
    running: "実行中",
    verifying: "検証中",
    completed: "完了",
    failed: "失敗",
    interrupted: "中断"
  },
  banner: {
    elapsed: "経過時間",
    cost: "コスト",
    ram: "RAM（常駐）",
    cpu: "CPU",
    pidTitle: "PID {pid} · {threads} スレッド · {status}",
    viewAgent: "このエージェントの会話を表示",
    view: "表示",
    interrupt: "このエージェントを中断",
    runTitle: "実行 {id}",
    runShort: "実行 {id}",
    wave: "ウェーブ {wave}",
    openDashboard: "ランナーの完全なダッシュボードを開く",
    dashboard: "ダッシュボード",
    spawning: "エージェントを起動中…",
    noAgents: "アクティブなエージェントはありません",
    title: "エージェントモード",
    activeOne: "{count} 件の実行がアクティブ",
    activeMany: "{count} 件の実行がアクティブ",
    cumulative: "累計 {cost}"
  },
  pill: {
    title: "エージェントモード",
    state: {
      idle: "アイドル",
      ready: "準備完了",
      running: "実行中",
      completed: "完了"
    },
    workingOne: "エージェントモード — {count} 個のエージェントが作業中",
    workingMany: "エージェントモード — {count} 個のエージェントが作業中",
    completedOne: "エージェントモード — {count} 件の実行が完了",
    completedMany: "エージェントモード — {count} 件の実行が完了",
    ready: "エージェントモード — 準備完了",
    streamingOne: "現在 {count} 件の実行がストリーミング中です。下のバナーにエージェントがリアルタイムで表示されます。",
    streamingMany: "現在 {count} 件の実行がストリーミング中です。下のバナーにエージェントがリアルタイムで表示されます。",
    more: "ほか {count} 件",
    readyNote: "このチャットにはリンクされたプランがありますが、現在ストリーミング中のものはありません。",
    ranOne: "このチャットから {count} 件の実行が行われました。現在ストリーミング中のものはありません。",
    ranMany: "このチャットから {count} 件の実行が行われました。現在ストリーミング中のものはありません。",
    openDashboard: "ランナーのダッシュボードを開く"
  },
  bg: {
    title: "バックグラウンドアクティビティ",
    listAria: "バックグラウンドアクティビティ一覧",
    summary: {
      running: "{count} 件実行中",
      queued: "{count} 件待機中",
      failed: "{count} 件失敗",
      done: "{count} 件完了",
      cancelled: "{count} 件キャンセル",
      ended: "{count} 件終了"
    }
  },
  card: {
    showMore: "もっと見る",
    showLess: "閉じる",
    lineOne: "{count} 行",
    lineMany: "{count} 行",
    earlierLineOne: "以前の {count} 行を表示",
    earlierLineMany: "以前の {count} 行を表示",
    progressOf: "{title} の進捗",
    agents: "{settled}/{total} エージェント",
    agentsOf: "{title} のエージェント",
    tokens: "{count} トークン",
    toolUseOne: "ツール使用 {count} 回",
    toolUseMany: "ツール使用 {count} 回",
    timeline: "タイムライン",
    eventOne: "{count} 件のイベント",
    eventMany: "{count} 件のイベント",
    eventsOf: "{title} のイベント",
    hiddenEventOne: "… 以前の {count} 件のイベントは保持されていません",
    hiddenEventMany: "… 以前の {count} 件のイベントは保持されていません",
    rawPayload: "生のペイロード",
    parameters: "パラメーター",
    latestOutput: "最新の出力",
    output: "出力",
    kind: {
      workflow: "ワークフロー",
      shell: "バックグラウンドコマンド",
      monitor: "モニター",
      agent: "サブエージェント",
      generic: "バックグラウンドアクティビティ"
    },
    status: {
      running: "実行中",
      queued: "待機中",
      done: "完了",
      failed: "失敗",
      cancelled: "キャンセル済み",
      ended: "終了"
    }
  },
  runs: {
    finished: "終了",
    view: "実行を表示",
    stop: "実行を停止",
    loading: "実行を読み込み中…",
    noDetails: "実行の詳細はありません。",
    inProgressOne: "{count} 件の実行が進行中",
    inProgressMany: "{count} 件の実行が進行中",
    completedOne: "{count} 件の実行が完了",
    completedMany: "{count} 件の実行が完了",
    done: "{count} 件完了"
  }
} satisfies Translation<'chatA-activity'>
