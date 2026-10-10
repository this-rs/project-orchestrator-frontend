import type { Translation } from '../../catalog.ts'

export default {
  ask: {
    answered: "回答済み:",
    placeholder: "または回答を入力...",
    submit: "送信",
    notSent: "未送信: 接続が切れました。回答は保持されています。再接続後にもう一度お試しください。"
  },
  attachments: {
    processing: "処理中…",
    remove: "削除",
    removeAria: "{name} を削除",
    pendingSend: "アップロードが終わるとメッセージが送信されます"
  },
  upload: {
    network: "ネットワークエラー — ファイルはサーバーに届きませんでした",
    timeout: "サーバーが時間内に応答しませんでした — ファイルを削除してもう一度追加してください",
    tooLarge: "ファイルが大きすぎます",
    unsupported: "サポートされていないファイル形式です",
    unreadable: "ファイルを読み取れませんでした（形式が不正または破損）",
    forbidden: "ここへのアップロードは許可されていません",
    failed: "アップロードに失敗しました（HTTP {status}）"
  },
  action: {
    send: "メッセージを送信",
    stop: "生成を停止",
    stopping: "停止中…",
    waiting: "添付ファイルのアップロード完了を待っています",
    idle: "メッセージを送信",
    removeFailed: "先に失敗した添付ファイルを削除してください",
    waitingUpload: "アップロードの完了を待っています"
  },
  composer: {
    imageName: "画像",
    alreadyIn: "{label} はすでにメッセージに含まれています。",
    added: "{label} をメッセージに追加しました。",
    close: "閉じる",
    maxRefs: "1 件のメッセージに付けられる参照は最大 {max} 件です。最後の 1 件は追加されませんでした。",
    references: "参照",
    placeholder: "メッセージを送信...",
    attach: "ファイルを添付",
    override: "（上書き）",
    default: "デフォルト",
    auto: "自動",
    autoOn: "自動継続を有効にしました",
    autoOff: "自動継続を無効にしました",
    drop: "ドロップして添付"
  }
} satisfies Translation<'chatA-input'>
