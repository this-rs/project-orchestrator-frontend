import type { Translation } from '../../catalog.ts'

export default {
  modes: {
    primary: { label: 'プライマリのみ', description: '排他的なプライマリプロバイダーを 1 つだけ使います（従来どおり）。PO は選んだはずの結果を記録するだけです。' },
    mixed: { label: 'ミックス', description: 'プライマリが会話を進め、PO が実行役を振り分けます。' },
    full: { label: 'フル', description: 'PO がすべてを選び、その理由を説明します。' },
  },
  stages: {
    shadow: { label: 'シャドウ', description: '何も適用せず、判断をすべて記録します。' },
    advisory: { label: 'アドバイザリー', description: 'PO が提案し、あなたが確認します。' },
    auto: { label: '自動', description: 'PO が判断をそのまま適用します。' },
  },
  routedBy: {
    session: 'セッション用に選択',
    request: 'リクエストで選択',
    task: 'タスクで選択',
    persona: 'ペルソナで選択',
    run: '実行で選択',
    project_rule: 'プロジェクトのルール',
    global_rule: 'グローバルルール',
    default: 'サーバーの既定',
    claude_code: 'Claude Code へのフォールバック',
    fallback: 'フォールバックチェーン',
    auto: 'PO が選択',
  },
  rejection: {
    not_allowed: 'このプロジェクトでは許可されていません',
    unhealthy: '異常',
    no_tools: 'ツールを呼び出せません',
    context_too_small: 'コンテキストウィンドウが小さすぎます',
    no_images: '画像を読み取れません',
    over_budget: '予算超過',
    trust_without_sandbox: 'サンドボックスなしの信頼モード',
    remote: 'リモートはここでは許可されていません',
  },
  badge: { poChooses: 'PO が選択', why: '理由' },
  advanced: { force: '詳細設定: この会話にプロバイダー/モデルを強制' },
  picker: { primary: 'プライマリ: {target} · PO が実行役をルーティング', forced: '強制: {target}', willChoose: '最初のメッセージで PO が選択します', routedBy: 'ルーティング元: {by}', aria: 'ルーティング: {mode}' },
  reason: '理由: {reason}',
  settings: { title: 'ルーティング', confirmAuto: '今後 PO は確認なしで自分の選択を適用します。続行しますか？' },
  report: { agreement: '実際の選択との一致率', costDelta: '推定コスト差', unknown: '不明' },
} satisfies Translation<'routing'>
