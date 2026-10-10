import type { Translation } from '../../catalog.ts'

export default {
  title: 'Commits',
  empty: 'commit이 없습니다',
  copy: 'SHA {sha} 복사',
  copied: '{sha} 복사됨',
  files: {
    one: '파일 {count}개',
    other: '파일 {count}개',
  },
  loadingFiles: '파일을 불러오는 중…',
  noFiles: '파일 상세 정보가 없습니다',
} satisfies Translation<'commits'>
