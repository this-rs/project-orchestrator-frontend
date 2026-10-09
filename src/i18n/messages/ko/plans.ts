import type { Translation } from '../../catalog.ts'

export default {
  description: '구현 단계를 계획하고 추적합니다',
  newPlan: '새 플랜',
  searchPlaceholder: '플랜 검색…',
  allStatuses: '모든 상태',
  project: '프로젝트',
  listLabel: '플랜',
  selectPlan: '{title} 선택',
  createdBy: '작성자: {name}',
  loaded: '{total}개 중 {loaded}개 불러옴',
  count: {
    one: '플랜 {count}개',
    other: '플랜 {count}개',
  },
  empty: {
    pristineTitle: '아직 플랜이 없습니다',
    pristineBody: '플랜을 만들어 개발 작업을 정리해 보세요.',
    filteredTitle: '일치하는 플랜이 없습니다',
    filteredBody: '검색어나 필터를 조정해 보세요.',
  },
  toast: {
    created: '플랜을 생성했습니다',
    updated: '플랜을 업데이트했습니다',
    deleted: '플랜을 삭제했습니다',
    deletedMany: {
      one: '플랜 {count}개를 삭제했습니다',
      other: '플랜 {count}개를 삭제했습니다',
    },
  },
  dialog: {
    create: '플랜 생성',
    edit: '플랜 편집',
  },
  confirm: {
    deleteTitle: '플랜을 삭제하시겠습니까?',
    deleteBody: '이 플랜과 모든 작업이 영구적으로 삭제됩니다.',
    bulkTitle: {
      one: '플랜 {count}개를 삭제하시겠습니까?',
      other: '플랜 {count}개를 삭제하시겠습니까?',
    },
    bulkBody: {
      one: '플랜 {count}개와 해당 작업이 모두 영구적으로 삭제됩니다.',
      other: '플랜 {count}개와 해당 작업이 모두 영구적으로 삭제됩니다.',
    },
  },
} satisfies Translation<'plans'>
