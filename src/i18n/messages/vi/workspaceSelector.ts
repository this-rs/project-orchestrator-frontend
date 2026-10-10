import type { Translation } from '../../catalog.ts'

export default {
  title: "Chọn một không gian làm việc",
  lead: "Không gian làm việc nhóm các dự án có chung bối cảnh và mục tiêu. Hãy chọn nơi bạn sẽ làm việc.",
  notFound: "Không tìm thấy không gian làm việc \"{slug}\"",
  notFoundBody: "Có thể nó đã bị xóa hoặc đổi tên. Hãy chọn một không gian khác bên dưới.",
  loading: "Đang tải các không gian làm việc",
  errorTitle: "Lỗi kết nối",
  errorBody: "Không tải được các không gian làm việc. Backend có đang chạy không?",
  create: "Tạo không gian làm việc",
  createSubmit: "Tạo",
  creating: "Đang tạo…",
  cancel: "Hủy",
  nameLabel: "Tên không gian làm việc",
  namePlaceholder: "Không gian làm việc của tôi",
  welcome: "Chào mừng đến với Project Orchestrator",
  welcomeLead: "Tạo không gian làm việc đầu tiên của bạn để bắt đầu.",
  createFirst: "Tạo không gian làm việc",
  createFailed: "Không tạo được không gian làm việc",
  updated: "cập nhật",
  explain: {
    what: "Không gian làm việc nhóm nhiều dự án của bạn có chung bối cảnh và mục tiêu.",
    why: "Bạn mở một không gian làm việc và thấy cùng lúc các dự án, kế hoạch, ghi chú và quyết định của nó; Hôm nay cho biết những gì đang chờ bạn ở tất cả.",
    different: "Thay vì mỗi dự án một thư mục không liên quan, các dự án trong một không gian làm việc chia sẻ những gì đã quyết định, nên trợ lý làm việc ở một dự án biết các dự án khác đã chốt gì.",
  },
} satisfies Translation<'workspaceSelector'>
