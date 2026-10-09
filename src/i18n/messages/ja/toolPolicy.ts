import type { Translation } from '../../catalog.ts'

export default {
  neutral: {
    trust: "Rock'n roll",
    auto_edits: "編集を自動承認",
    ask: "確認する",
    plan_only: "プランのみ",
  },
  composer: {
    trust: "Rock'n roll",
    auto_edits: "編集を承認",
    ask: "標準",
    plan_only: "プランのみ",
  },
  session: {
    trust: "Rock'n roll",
    auto_edits: "編集を承認",
    ask: "権限を確認",
    plan_only: "プランモード",
  },
  native: {
    auto: { short: "自動", long: "自動モード" },
    dontAsk: { short: "確認しない", long: "確認しない" },
  },
  settings: {
    claude: {
      trust: { label: "Rock'n roll", description: "すべてのツールを自動承認します。確認はありません。" },
      auto_edits: { label: "編集を承認", description: "ファイルの編集は自動承認し、コマンドは確認します。" },
      ask: { label: "標準", description: "すべてのツールの使用を確認します。" },
      plan_only: { label: "プランのみ", description: "読み取り専用モードです。書き込みもコマンドも実行しません。" },
    },
    neutral: {
      trust: { description: "確認せずにすべてのツールを実行します。" },
      auto_edits: { description: "ファイルの編集は確認なしで実行し、コマンドは引き続き確認します。" },
      ask: { description: "ツールを呼び出すたびに確認します。" },
      plan_only: { description: "読み取り専用です。書き込みもコマンドも実行しません。" },
    },
  },
  setup: {
    trust: {
      label: "Rock'n roll",
      description: "すべてのツールを自動承認 — 権限の確認はありません",
      summary: "Rock'n roll（すべて自動承認）",
    },
    ask: {
      label: "標準",
      description: "ファイルの編集とシェルコマンドの承認を求めます",
      summary: "標準（編集とシェルを確認）",
    },
    auto_edits: {
      label: "編集を承認",
      description: "ファイルの編集は自動承認し、シェルコマンドは承認が必要です",
      summary: "編集を承認（シェルのみ確認）",
    },
    plan_only: {
      label: "プランのみ",
      description: "読み取り専用モード — Claude はファイルを読めますが、変更はできません",
      summary: "プランのみ（読み取り専用）",
    },
  },
  trustRequiresSandbox: "利用できません：このリモートマシンではこのモードを許可していません。確認なしでツールを実行するには、インスタンスの設定で有効にしてください。",
  rulesUnsupported: "許可ルールと拒否ルールは Claude Code 固有のものです。このプロバイダーは適用しないため表示していません。ツールを制御するのは上の権限モードです。",
  trustDowngraded: "このリモートマシンでは「Rock’n roll」モードを許可していないため、「確認する」に置き換えられました。",
} satisfies Translation<'toolPolicy'>
