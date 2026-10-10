import type { Translation } from '../../catalog.ts'

export default {
  copy: {
    title: "Sao chép dưới dạng markdown",
    copied: "Đã sao chép!",
    popupTitle: "Markdown của tin nhắn"
  },
  compact: {
    label: "Đã nén ngữ cảnh",
    trigger: {
      auto: "tự động",
      manual: "thủ công"
    },
    tokens: "~{count}K token"
  },
  continued: {
    label: "Đã tiếp tục",
    afterOne: "sau {count} lượt",
    afterMany: "sau {count} lượt"
  },
  bubble: {
    references: "Tham chiếu",
    attachments: "Tệp đính kèm",
    copyMessage: "Sao chép tin nhắn dưới dạng markdown",
    copyReply: "Sao chép phản hồi dưới dạng markdown",
    thinking: "Đang suy nghĩ..."
  },
  list: {
    loading: "Đang tải tin nhắn...",
    loadingOlder: "Đang tải tin nhắn cũ hơn...",
    beginning: "— Đầu cuộc trò chuyện —",
    loadingNewer: "Đang tải tin nhắn mới hơn...",
    scrollMore: "— Cuộn xuống để xem thêm —",
    catchingUp: "Đang bắt kịp…",
    newActivity: "Hoạt động mới ↓"
  },
  compaction: {
    label: "Đang nén ngữ cảnh"
  },
  welcome: {
    title: "Project Orchestrator",
    subtitle: "Bạn muốn làm gì?",
    quickActions: "Thao tác nhanh",
    selectProject: "Chọn một dự án ở trên để dùng thao tác nhanh",
    projectStatus: "Trạng thái dự án",
    activePlanOne: "{count} kế hoạch đang hoạt động",
    activePlanMany: "{count} kế hoạch đang hoạt động",
    toReview: "{count} cần xem lại",
    allClear: "Mọi thứ ổn",
    notesOne: "{count} ghi chú",
    notesMany: "{count} ghi chú",
    synced: "Đồng bộ {when}",
    untitled: "Không có tiêu đề",
    untitledConversation: "Cuộc trò chuyện không có tiêu đề",
    recent: "Cuộc trò chuyện gần đây",
    actions: {
      next: {
        label: "Tác vụ tiếp theo",
        description: "Lấy tác vụ khả dụng tiếp theo",
        prompt: "Tác vụ khả dụng tiếp theo của kế hoạch đang hoạt động là gì? Cho tôi xem ngữ cảnh và các bước của nó."
      },
      plan: {
        label: "Lập kế hoạch cho một việc",
        description: "Lập kế hoạch triển khai",
        prompt: "Hãy lập kế hoạch triển khai: "
      },
      impact: {
        label: "Phân tích tác động",
        description: "Phân tích tác động của thay đổi",
        prompt: "Hãy phân tích tác động của việc thay đổi: "
      },
      arch: {
        label: "Kiến trúc",
        description: "Tổng quan codebase",
        prompt: "Cho tôi tổng quan về kiến trúc dự án"
      },
      search: {
        label: "Tìm kiếm mã",
        description: "Tìm trong codebase",
        prompt: "Hãy tìm trong mã: "
      },
      roadmap: {
        label: "Lộ trình",
        description: "Cột mốc và bản phát hành",
        prompt: "Cho tôi xem lộ trình đầy đủ với các cột mốc và bản phát hành"
      }
    },
    time: {
      now: "vừa xong",
      minutes: "{count} phút trước",
      hours: "{count} giờ trước",
      days: "{count} ngày trước",
      months: "{count} tháng trước"
    },
    plan: {
      draft: "Bản nháp",
      approved: "Đã duyệt",
      in_progress: "Đang thực hiện",
      completed: "Hoàn tất",
      cancelled: "Đã hủy"
    }
  },
  panel: {
    connected: "Đã kết nối",
    reconnecting: "Đang kết nối lại…",
    disconnected: "Đã ngắt kết nối",
    connectionLost: "Mất kết nối",
    exportTitle: "Xuất cuộc trò chuyện",
    newChatTitle: "Cuộc trò chuyện mới",
    chatTitle: "Trò chuyện",
    conversations: "Cuộc trò chuyện",
    newConversation: "Cuộc trò chuyện mới",
    backToChat: "Quay lại cuộc trò chuyện",
    sessions: "Phiên",
    newChat: "Cuộc trò chuyện mới",
    assistantTree: "Cây trợ lý",
    permissionSettings: "Cài đặt quyền",
    copied: "Đã sao chép!",
    copyChat: "Sao chép cuộc trò chuyện dưới dạng markdown",
    exitFullscreen: "Thoát toàn màn hình",
    close: "Đóng",
    backToParent: "Quay lại phiên cha",
    actions: "Thao tác của cuộc trò chuyện",
    attach: "Gắn vào một kế hoạch hoặc tác vụ…",
    hideTree: "Ẩn cây trợ lý",
    showTree: "Hiện cây trợ lý",
    fullscreen: "Toàn màn hình",
    noProjectsTitle: "Chưa có dự án nào",
    noProjectsBody: "Hãy thêm một dự án vào workspace này để bắt đầu trò chuyện với Claude.",
    addProject: "Thêm dự án"
  }
} satisfies Translation<'chatA-messages'>
