import type { Translation } from '../../catalog.ts'

export default {
  title: 'Commits',
  empty: 'commit はありません',
  copy: 'SHA {sha} をコピー',
  copied: '{sha} をコピーしました',
  files: {
    one: '{count} 件のファイル',
    other: '{count} 件のファイル',
  },
  loadingFiles: 'ファイルを読み込み中…',
  noFiles: 'ファイルの詳細はありません',
} satisfies Translation<'commits'>
