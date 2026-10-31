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
    openAttachment: "Mở {name}",
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
  spawn: {
    runner: "bộ chạy",
    conversation: "phát sinh",
    delegation: "được uỷ quyền",
    pipeline: "chuỗi xử lý",
    gate: "cổng kiểm",
    trigger: "bộ kích hoạt",
    mirrorClaudeCode: "tác tử con (Claude Code)",
    subagentOf: "Tác nhân con của một hội thoại khác"
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
      },
      prepare: {
        label: "Chuẩn bị một việc",
        description: "Một sự kiện, một tệp, một buổi ra mắt",
        prompt: "Giúp tôi chuẩn bị những điều sau, dưới dạng kế hoạch công việc kèm các phụ thuộc: "
      },
      track: {
        label: "Theo dõi một việc",
        description: "Một ngân sách, một lịch trình, một danh sách",
        prompt: "Thiết lập cách theo dõi những điều sau: một kế hoạch với các công việc, ghi chú cho những gì tôi nói, và một quyết định mỗi khi tôi chọn. Đây là điều cần theo dõi: "
      },
      resume: {
        label: "Tiếp tục điều đã dừng",
        description: "Tiếp nhận công việc đang chờ",
        prompt: "Điều gì đã dừng hoặc đang chờ tôi? Liệt kê rồi tiếp tục mục đầu tiên."
      },
      decided: {
        label: "Chúng ta đã quyết định gì?",
        description: "Các quyết định và lý do",
        prompt: "Chúng ta đã quyết định gì đến nay, và vì sao? Liệt kê các quyết định cùng lý do và các phương án đã loại."
      },
      standing: {
        label: "Chúng ta đang ở đâu?",
        description: "Mục tiêu, kế hoạch, tiến độ",
        prompt: "Cho tôi thấy chúng ta đang ở đâu: mục tiêu, kế hoạch, việc đã xong và việc tiếp theo."
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
    mirrorBanner: "Bản phản chiếu chỉ đọc của một tác tử con Claude Code",
    actions: "Thao tác của cuộc trò chuyện",
    attach: "Gắn vào một kế hoạch hoặc tác vụ…",
    hideTree: "Ẩn cây trợ lý",
    showTree: "Hiện cây trợ lý",
    fullscreen: "Toàn màn hình",
    noProjectsTitle: "Chưa có dự án nào",
    noProjectsBody: "Hãy thêm một dự án vào workspace này để bắt đầu trò chuyện với Claude.",
    addProject: "Thêm dự án"
  },
  attachment: {
    download: "Tải xuống",
    noPreview: "Không thể hiển thị định dạng này ở đây — vẫn có thể tải tệp xuống.",
    noText: "Không thể trích xuất văn bản từ tệp này — vẫn có thể tải xuống.",
    loadFailed: "Không thể đọc tệp.",
    truncated: "Bản xem trước chỉ giới hạn ở {chars} ký tự đầu — hãy tải tệp để xem phần còn lại.",
  },
} satisfies Translation<'chatA-messages'>
