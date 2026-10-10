import type { Translation } from '../../catalog.ts'

export default {
  description: 'Lên kế hoạch và theo dõi các giai đoạn triển khai',
  newPlan: 'Kế hoạch mới',
  searchPlaceholder: 'Tìm kế hoạch…',
  allStatuses: 'Tất cả trạng thái',
  project: 'Dự án',
  listLabel: 'Kế hoạch',
  selectPlan: 'Chọn {title}',
  createdBy: 'Tạo bởi {name}',
  loaded: 'Đã tải {loaded} trên {total}',
  count: {
    one: '{count} kế hoạch',
    other: '{count} kế hoạch',
  },
  empty: {
    pristineTitle: 'Chưa có kế hoạch nào',
    pristineBody: 'Tạo một kế hoạch để sắp xếp công việc phát triển của bạn.',
    filteredTitle: 'Không có kế hoạch phù hợp',
    filteredBody: 'Hãy thử điều chỉnh tìm kiếm hoặc bộ lọc.',
  },
  toast: {
    created: 'Đã tạo kế hoạch',
    updated: 'Đã cập nhật kế hoạch',
    deleted: 'Đã xóa kế hoạch',
    deletedMany: {
      one: 'Đã xóa {count} kế hoạch',
      other: 'Đã xóa {count} kế hoạch',
    },
  },
  dialog: {
    create: 'Tạo kế hoạch',
    edit: 'Chỉnh sửa kế hoạch',
  },
  confirm: {
    deleteTitle: 'Xóa kế hoạch?',
    deleteBody: 'Kế hoạch này và tất cả tác vụ của nó sẽ bị xóa vĩnh viễn.',
    bulkTitle: {
      one: 'Xóa {count} kế hoạch?',
      other: 'Xóa {count} kế hoạch?',
    },
    bulkBody: {
      one: '{count} kế hoạch và tất cả tác vụ của nó sẽ bị xóa vĩnh viễn.',
      other: '{count} kế hoạch và tất cả tác vụ của chúng sẽ bị xóa vĩnh viễn.',
    },
  },
} satisfies Translation<'plans'>
