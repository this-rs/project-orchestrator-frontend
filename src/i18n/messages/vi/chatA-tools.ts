import type { Translation } from '../../catalog.ts'

export default {
  agent: {
    asked: "Giao cho tác nhân con",
    kind: "Loại tác nhân",
    answer: "Câu trả lời của nó",
    failed: "Tác nhân con đã thất bại",
    open: "Mở hội thoại con",
    openTitle: "Mở hội thoại mà tác nhân con này đã làm việc",
    running: "Tác nhân con vẫn đang làm việc…",
    noChild: "Hội thoại con chưa có trong danh sách",
    noChildTitle: "Hội thoại con được tìm theo mã của lần gọi công cụ này. Nó xuất hiện ngay khi máy chủ liệt kê."
  },
  /** WebFetch / WebSearch: their result is data from the outside, never the assistant's text. */
  web: {
    externalSearch: "Kết quả tìm kiếm: nội dung bên ngoài, không do trợ lý viết",
    externalPage: "Nội dung trang: nội dung bên ngoài, không do trợ lý viết",
  },
  bash: {
    emptyCommand: "(lệnh trống)",
    showLess: "thu gọn",
    showMore: "hiện thêm {count} ký tự",
    noOutput: "không có đầu ra",
    running: "đang chạy..."
  },
  default: {
    input: "Đầu vào",
    error: "Lỗi",
    result: "Kết quả",
    truncated: "... (đã cắt bớt)"
  },
  edit: {
    replaceAll: "thay thế tất cả",
    removedLineOne: "-{count} dòng",
    removedLineMany: "-{count} dòng",
    addedLineOne: "+{count} dòng",
    addedLineMany: "+{count} dòng",
    moreRemovedOne: "... còn {count} dòng bị xóa",
    moreRemovedMany: "... còn {count} dòng bị xóa",
    moreAddedOne: "... còn {count} dòng được thêm",
    moreAddedMany: "... còn {count} dòng được thêm",
    truncated: "... (đã cắt bớt)",
    editing: "đang chỉnh sửa..."
  },
  chat: {
    you: "Bạn",
    assistant: "Trợ lý",
    messageOne: "{count} tin nhắn",
    messageMany: "{count} tin nhắn"
  },
  code: {
    copyPath: "Sao chép đường dẫn",
    noResults: "Không có kết quả",
    searchResults: "Kết quả tìm kiếm",
    noSymbols: "Không tìm thấy ký hiệu nào",
    noReferences: "Không tìm thấy tham chiếu nào",
    unknownFile: "(không rõ)",
    references: "Tham chiếu",
    calledBy: "Được gọi bởi",
    calls: "Gọi tới",
    noCallGraph: "Không có dữ liệu đồ thị lời gọi",
    callersColon: "bên gọi:",
    dependentFiles: "Tệp phụ thuộc",
    mostConnected: "Tệp có nhiều kết nối nhất",
    imports: "Nhập (import)",
    importedBy: "Được nhập bởi",
    label: {
      results: "kết quả",
      files: "tệp",
      callers: "bên gọi",
      callees: "bên được gọi",
      imports: "import",
      dependents: "bên phụ thuộc"
    },
    cat: {
      functions: "hàm",
      structs: "struct",
      enums: "enum",
      traits: "trait",
      impls: "impl",
      macros: "macro",
      constants: "hằng số",
      type_aliases: "bí danh kiểu"
    },
    symbols: {
      implementations: "Các triển khai",
      traits: "Trait",
      impls: "Khối impl"
    },
    symbolsNone: {
      implementations: "Không tìm thấy triển khai nào",
      traits: "Không tìm thấy trait nào",
      impls: "Không tìm thấy khối impl nào"
    }
  },
  entity: {
    project: "dự án",
    created: "tạo lúc",
    plan: "kế hoạch",
    path: "đường dẫn",
    synced: "đồng bộ",
    target: "mục tiêu",
    verify: "xác minh",
    tasks: "Tác vụ",
    constraints: "Ràng buộc",
    criteria: "Tiêu chí chấp nhận",
    steps: "Các bước",
    decisions: "Quyết định",
    label: {
      tasks: "tác vụ",
      constraints: "ràng buộc",
      criteria: "tiêu chí",
      steps: "bước",
      decisions: "quyết định"
    },
    type: {
      plan: "kế hoạch",
      task: "tác vụ",
      project: "dự án",
      milestone: "cột mốc",
      workspace: "workspace",
      note: "ghi chú",
      release: "bản phát hành"
    },
    view: {
      entity: "Xem {entity}",
      parentTask: "Xem tác vụ cha",
      parentPlan: "Xem kế hoạch cha",
      linkedTask: "Xem tác vụ liên kết",
      linkedPlan: "Xem kế hoạch liên kết"
    },
    deleted: "Đã xóa",
    updated: "Đã cập nhật",
    createdVerb: "Đã tạo",
    moreFields: "+{count} trường nữa"
  },
  list: {
    untitledPlan: "Kế hoạch không có tiêu đề",
    untitledSession: "Phiên không có tiêu đề",
    msgOne: "{count} tin",
    msgMany: "{count} tin",
    energy: "Mức năng lượng",
    target: "mục tiêu: {date}",
    noResults: "Không có kết quả",
    resultOne: "{count} kết quả",
    resultMany: "{count} kết quả",
    matching: "khớp với “{query}”"
  },
  viz: {
    noRadar: "Không có dữ liệu radar.",
    unknownTarget: "không rõ",
    direct: "Trực tiếp ({count})",
    transitive: "Bắc cầu ({count})",
    total: "tổng {count}",
    importance: {
      critical: "NGHIÊM TRỌNG",
      high: "CAO",
      medium: "TRUNG BÌNH",
      low: "THẤP"
    },
    kind: {
      guideline: "guideline",
      gotcha: "bẫy",
      pattern: "mẫu",
      context: "ngữ cảnh",
      tip: "mẹo",
      observation: "quan sát",
      assertion: "khẳng định",
      decision: "quyết định"
    }
  },
  permission: {
    actions: "Trả lời yêu cầu cấp quyền này",
    allowOnce: "Cho phép một lần",
    allowSession: "Cho phiên này",
    deny: "Từ chối",
    sessionHint: "Không hỏi lại trong cuộc trò chuyện này cho đúng lệnh gọi này",
    awaiting: "Đang chờ xác nhận…",
    sessionCovers: "Nếu được chấp nhận, “Cho phiên này” chỉ áp dụng cho:",
    forbidden: "Chỉ người sở hữu cuộc trò chuyện này mới có thể trả lời. Chưa có gì được trả lời.",
    ownerUnreadable: "Không thể kiểm tra cuộc trò chuyện này thuộc về ai. Chưa có gì được trả lời: hãy thử lại.",
    unconfirmed: "Không nhận được xác nhận. Hãy trả lời lại.",
    scopeRefused: "Quyền này không thể giữ cho phiên (lệnh gọi chạy một lệnh khác, hoặc phiên không cung cấp). Hãy cho phép một lần hoặc từ chối.",
    allowed: "Đã cho phép",
    allowedSession: "Đã cho phép cho phiên",
    denied: "Đã từ chối",
    allowAlways: "Luôn luôn",
    alwaysHint: "Không hỏi lại cho đúng lệnh gọi này trong các cuộc trò chuyện của dự án này chạy trong thư mục của nó, trên máy này; sẽ hỏi lại nếu cuộc trò chuyện đã đổi thư mục",
    alwaysCovers: "Nếu được cấp, «Luôn luôn» chỉ bao gồm:",
    destinationHint: 'Một đích đến mạng: phạm vi cấp quyền do bộ điều phối quyết định và được nêu ngay khi bạn trả lời',
    destinationCovers: 'Lệnh gọi này đến:',
    destinationAlwaysHint: 'Có thể được ghi lại thành đồng thuận mạng của dự án này, được liệt kê và có thể thu hồi trong Cài đặt → Công cụ mạng',
    destinationAlwaysCovers: '“Luôn luôn” có thể được ghi lại thành đồng thuận mạng của dự án này (Cài đặt → Công cụ mạng).',
    alwaysRefused: "Không thể cho phép vĩnh viễn lệnh gọi này (chỉ một lần đọc chính xác, hoặc một lệnh chỉ đọc không chuyển hướng hay nối lệnh). Hãy trả lời một lần hoặc cho phiên.",
    allowedAlways: "Luôn được cho phép"
  },
  lastingRules: {
    title: "Lệnh gọi luôn được cho phép",
    description: "Các lệnh gọi bạn đã cho phép vĩnh viễn, theo dự án. Mỗi mục chỉ bao gồm đúng lệnh gọi đó, trong các cuộc trò chuyện chạy trong thư mục dự án trên máy này. Khi thu hồi, nó sẽ được hỏi lại từ yêu cầu tiếp theo trên máy này.",
    empty: "Không có lệnh gọi nào được cho phép vĩnh viễn.",
    disabled: "Máy chủ này không lưu phê duyệt vĩnh viễn nào.",
    revoke: "Thu hồi",
    revoked: "Đã thu hồi: được hỏi lại từ yêu cầu tiếp theo trên máy này.",
    loadFailed: "Không thể tải các phê duyệt vĩnh viễn của bạn.",
    revokeFailed: "Không thể thu hồi. Hãy thử lại.",
    notHeld: "Không còn áp dụng",
    engineNative: "công cụ gốc",
    engineClaudeCode: "Claude Code",
    sandboxDisabled: "ngoài sandbox"
  }
} satisfies Translation<'chatA-tools'>
