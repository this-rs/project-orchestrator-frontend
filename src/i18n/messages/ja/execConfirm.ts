import type { Translation } from '../../catalog.ts'

export default {
  aria: 'このフォルダでタスクを実行することを許可',
  title: 'このフォルダで実行しますか？',
  hint: 'あなたが答えるまで何も始まりません。許可できるのはあなただけです。',
  allow: '許可',
  reject: '拒否',
  state: {
    confirmed: '確認済み：タスクを開始します。',
    rejected: '拒否しました：何も実行されていません。',
    expired: '期限切れ：委任をもう一度依頼してください。',
  },
  error: {
    forbidden: 'このリクエストに答えられるのは所有者だけです。',
    conflict: 'このリクエストは回答済みか、すでに一致しません。',
    other: '回答を送信できませんでした',
  },
} satisfies Translation<'execConfirm'>
