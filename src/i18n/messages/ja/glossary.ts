import type { Translation } from '../../catalog.ts'

export default {
  energy: {
    label: "エネルギー",
    description: "要素の最近の活動量です。エネルギーが高いほど、その要素は活発に作業されています。",
  },
  cohesion: {
    label: "凝集度",
    description: "モジュールやコンポーネントの内部の結びつきの強さを表す指標です。凝集度が高いと、要素どうしが密接につながっています。",
  },
  synapse: {
    label: "シナプス",
    description: "プロジェクトの 2 つの要素（ノート、タスク、ファイル）をつなぐ接続です。依存関係や文脈の関係を表します。",
  },
  scar: {
    label: "傷跡（Scar）",
    description: "過去の問題が残した痕跡です。壊れやすい箇所を示して、同じ失敗の繰り返しを防ぎます。",
  },
  moat: {
    label: "堀（Moat）",
    description: "重要なコンポーネントを守る防護壁です。そこを変更するときは特に注意が必要だと知らせます。",
  },
  spreading_activation: {
    label: "活性化拡散",
    description: "ある要素の重要度をグラフ上の隣の要素へ伝える仕組みで、ネットワークを波が伝わるように広がります。",
  },
  fabric: {
    label: "ファブリック（Fabric）",
    description: "プロジェクトの知識ネットワークです。ノート、決定事項、コードのあいだの接続の集まりを指します。",
  },
  trajectory: {
    label: "軌跡",
    description: "アシスタントやタスクがプロジェクトの各段階をたどった道のりの履歴です。",
  },
  protocol: {
    label: "プロトコル",
    description: "ワークフローを表す有限状態機械です。状態間で許される遷移を定めます。",
  },
  persona: {
    label: "ペルソナ",
    description: "アシスタントの振る舞いとスキルを方向づけるために割り当てる、専門化したプロフィールです。",
  },
  episode: {
    label: "エピソード",
    description: "アシスタントの作業セッションの記録で、実行した操作と得られた結果が残ります。",
  },
  neural_routing: {
    label: "ニューラルルーティング",
    description: "スキルと作業量にもとづいて、タスクをアシスタントへ賢く振り分けます。",
  },
  milestone: {
    label: "マイルストーン",
    description: "プロジェクトの重要な節目です。タスクをまとめ、進捗の大きな区切りを示します。",
  },
  feature_graph: {
    label: "機能グラフ",
    description: "プロジェクトの機能どうしの依存関係を可視化し、どの機能がどれに依存しているかを示します。",
  },
  lifecycle_hook: {
    label: "ライフサイクルフック",
    description: "ステータスの変化で自動的に動く処理です（例：タスクが「完了」になったときの通知）。",
  },
  constraint: {
    label: "制約",
    description: "タスクやプランに適用されるルールや制限です。作業が有効と認められるには守る必要があります。",
  },
  decision: {
    label: "決定事項",
    description: "アーキテクチャや技術の選択を、文脈と理由とともに将来の参照用に記録したものです。",
  },
  component: {
    label: "コンポーネント",
    description: "プロジェクトの機能的なまとまり（バックエンド、フロントエンド、API など）で、コードと責任を整理するために使います。",
  },
  workspace: {
    label: "ワークスペース",
    description: "プロジェクト、タスク、リソースをまとめる独立した入れ物です。作業の文脈ごとに分けて保ちます。",
  },
  skill: {
    label: "スキル",
    description: "アシスタントが身につけた能力の記録で、何ができるか、どの習熟度かを表します。",
  },
  release: {
    label: "リリース",
    description: "公開されたプロジェクトのバージョンで、本番に出す準備のできた変更をまとめたものです。",
  },
  success_rate: {
    label: "成功率",
    description: "このペルソナが正常に完了したタスクの割合です。任された仕事での信頼性を表します。",
  },
  activation_count: {
    label: "起動回数",
    description: "要素が起動された（アシスタントに使われた）回数です。多いほど、その要素がよく呼び出されています。",
  },
  analysis_profile: {
    label: "分析プロファイル",
    description: "プロジェクトの分析方法を定める設定です。どの指標を計算し、どのしきい値を使うかを決めます。",
  },
  co_change: {
    label: "共変更",
    description: "よく一緒に変更されるファイルです。共変更が強いと、意図的かどうかを問わず結合があると考えられます。",
  },
  coupling: {
    label: "結合度",
    description: "2 つのモジュールの依存の度合いです。保守しやすくするには、結合度が低いほうが望ましいです。",
  },
  churn: {
    label: "チャーン（変更頻度）",
    description: "ファイルがどれだけ頻繁に変更されるかです。高いチャーンは、不安定な箇所か活発に開発中の箇所を示すことがあります。",
  },
  hotspot: {
    label: "ホットスポット",
    description: "頻繁に変更される複雑なファイルです。バグのリスクが集中するため、注意して見るべき箇所です。",
  },
  orphan: {
    label: "孤立ファイル",
    description: "ほかのファイルからインポートもエクスポートもされていないファイルです。不要なコードか、うまく組み込まれていないファイルの可能性があります。",
  },
  dead_note: {
    label: "死んだノート",
    description: "エネルギーが残っていないノートです。長いあいだ読まれても変更されてもおらず、古くなっている可能性が高いです。",
  },
  stale_note: {
    label: "古いノート",
    description: "しばらく内容が更新されておらず、プロジェクトの現状を反映していないかもしれないノートです。",
  },
  god_function: {
    label: "神関数（God function）",
    description: "長すぎる、または複雑すぎて多くのことをやりすぎる関数です。小さな関数に分けるべきです。",
  },
  clustering_coefficient: {
    label: "クラスタリング係数",
    description: "あるノードの隣接ノードどうしの接続の密度を測ります。係数が高いと、密に結びついたグループであることを示します。",
  },
  knowledge_coverage: {
    label: "知識カバレッジ",
    description: "ノートと決定事項の数に対するコードファイルの数の比率です。コードがよく文書化されているかを示します。",
  },
  note_freshness: {
    label: "ノートの鮮度",
    description: "まだ最新のノートの割合です。低い場合は、読み直すべきノートが多いことを意味します。",
  },
  synapse_quality: {
    label: "シナプスの質",
    description: "ネットワーク内の確かな接続の割合です。弱いシナプスは、要素間の頼りにならないつながりです。",
  },
  skills_maturity: {
    label: "スキルの成熟度",
    description: "全体に対する有効なスキルの比率です。プロジェクトに対するチーム全体の習熟度を示します。",
  },
  code_safety: {
    label: "コードの安全性",
    description: "リスク評価にもとづくスコアです。重大・高リスクのファイルと脆弱性を考慮します。",
  },
  health_score: {
    label: "健全性スコア",
    description: "知識カバレッジ、ノートの鮮度、ニューラルエネルギー、シナプスの質、スキルの成熟度を組み合わせた総合スコアです。",
  },
  circular_dependency: {
    label: "循環依存",
    description: "2 つのモジュールが互いに依存してループになっている状態です。コードの保守とテストが難しくなります。",
  },
} satisfies Translation<'glossary'>
