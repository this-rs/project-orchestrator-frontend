import type { Translation } from '../../catalog.ts'

export default {
  degradation: {
    title: "この会話では一部の機能を利用できません",
    harness: {
      heading: "Project Orchestrator のエージェントエンジンはまだ対応していません",
      note: "こちら側で対応中です。モデルの制限ではありません。",
    },
    model: {
      heading: "このモデルまたはプロバイダーの制限",
      note: "プロバイダーがこのモデルについて申告した内容です。",
    },
    unprobed: {
      heading: "まだ計測されていません",
      note: "不明は「ない」という意味ではありません。",
    },
  },
  harness: {
    hooks: "フック（スキル、ツール後のリダイレクト）はまだ実行されません",
    message_queue: "ターン中に送信したメッセージはキューに入らず拒否されます",
    auto_continue: "自動継続はまだ利用できません",
    retry: "失敗したターンはまだ自動で再試行されません",
    compaction: "コンテキストの圧縮はまだ自動で行われません",
    nats: "セッション間のライブイベント（NATS）はまだ接続されていません",
    enrichment: "メッセージのエンティティ補強はまだ接続されていません",
    images: "画像はまだモデルに渡されません",
    tools: "ツールはまだモデルに渡されません",
    unknown: "{feature}：まだ利用できません",
  },
  model: {
    images: "このモデルは画像を受け付けません",
    tools: "このモデルはツールを呼び出せません",
    compaction: "このプロバイダーはコンテキスト圧縮を通知しません",
    project_orchestrator_tools: "このプロバイダーは Project Orchestrator のツールを扱えません（セッションごとの MCP サーバーなし）",
  },
  unprobed: {
    context_window: "コンテキストウィンドウはまだ調査されていません。モデルに長いコンテキストがないという意味ではありません",
  },
  images: {
    model: "このモデルは画像を受け付けません。添付されなかったもの：{names}。",
    harness: "Project Orchestrator のエージェントエンジンはまだ画像をモデルに渡しません。添付されなかったもの：{names}。",
  },
  errors: {
    harnessGap: "Project Orchestrator のエージェントエンジンはまだこれに対応していません（{feature}）。こちら側で対応中であり、モデルの制限ではありません。",
  },
  init: {
    title: "セッションを初期化しました",
    tools: "ツール {count} 個",
    mcpServers: "MCP サーバー {count} 個",
  },
  tools: {
    toggle: "このセッションで提供されるツールを表示",
    heading: "このセッションで提供されるツール",
    builtin: "組み込みツール",
    server: "MCP サーバー {server}",
    shortened: "名前が短縮された MCP ツール（64 文字で切り詰め）",
    count: "ツール {count} 個",
    allowHeading: "許可されたパターン",
    available: "利用可能：一致するツール {count} 個",
    unavailable: "このセッションでは利用できません",
  },
} satisfies Translation<'session'>
