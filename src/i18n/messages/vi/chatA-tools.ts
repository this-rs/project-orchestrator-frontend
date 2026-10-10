import type { Translation } from '../../catalog.ts'

export default {
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
    sessionHint: "Không hỏi lại trong cuộc trò chuyện này cho đúng lệnh gọi này (mọi lệnh gọi, với công cụ chỉ đọc)",
    awaiting: "Đang chờ xác nhận…",
    scopeRefused: "Quyền này không thể giữ cho phiên (lệnh gọi chạy một lệnh khác, hoặc phiên không cung cấp). Hãy cho phép một lần hoặc từ chối.",
    allowed: "Đã cho phép",
    allowedSession: "Đã cho phép cho phiên",
    denied: "Đã từ chối"
  }
} satisfies Translation<'chatA-tools'>
