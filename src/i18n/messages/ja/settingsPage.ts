import type { Translation } from '../../catalog.ts'

export default {
  back: "戻る",
  settings: {
    title: "設定",
    description: "デスクトップアプリの設定です。アシスタントとのすべての会話に適用されます。",
    chatTitle: "チャットと AI",
    chatDescription: "権限モード、許可・拒否するツール、環境変数、アシスタントが使う Claude Code CLI。",
    updatesTitle: "アップデート",
    updatesDescription: "デスクトップアプリの新しいバージョンを確認してインストールします。",
    providersNote: "プロバイダー（インスタンス、プロジェクトの同意、ロール、モデルポリシー）には専用のページがあります：",
    providersLink: "プロバイダー → /providers",
    explain: {
      what: "設定はデスクトップアプリ自体の選択肢です。アシスタントがこのマシンで何をしてよいか、アプリがどう更新されるかを決めます。",
      why: "アシスタントが実行できること、使えるツール、使用するバージョンを一度決めるだけです。",
      different: "現在これらの選択は設定ファイルやターミナルのフラグに散らばっています。ここでは一つの画面にまとまり、すべての会話に適用されます。",
    },
  },
  providers: {
    title: "プロバイダー",
    description: "会話がどこで動くか、各プロジェクトがそこへ何を送れるか、どのモデルが何を担当するか。",
    explain: {
      what: "AI を選べます。Claude Code は組み込み済みで、別のプロバイダーを登録してプロジェクトごとに許可できます。",
      why: "会話ごとにプロバイダーとモデルを選びます。キーはフォームに入力せず、ボールトに保管されます。",
      different: "今は一つのツールに一つのモデルです。ここでは会話は自分のプロバイダーにとどまり、タスクを委任するアシスタントはそのタスクのプロバイダーとモデルを指定できます。",
    },
  },
} satisfies Translation<'settingsPage'>
