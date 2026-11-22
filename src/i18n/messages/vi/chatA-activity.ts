import type { Translation } from '../../catalog.ts'

export default {
  kindName: {
    run: "lượt chạy",
    workflow: "workflow",
    agent: "agent",
    shell: "shell",
    monitor: "monitor"
  },
  kindCount: {
    run: {
      one: "{count} lượt chạy",
      many: "{count} lượt chạy"
    },
    workflow: {
      one: "{count} workflow",
      many: "{count} workflow"
    },
    agent: {
      one: "{count} agent",
      many: "{count} agent"
    },
    shell: {
      one: "{count} shell",
      many: "{count} shell"
    },
    monitor: {
      one: "{count} monitor",
      many: "{count} monitor"
    }
  },
  row: {
    progress: "{settled}/{total} agent",
    stopping: "đang dừng…",
    stoppingTitle: "Đang dừng…",
    stop: "Dừng",
    stopAria: "Dừng {title}",
    stopRun: "Dừng lượt chạy này",
    show: "Hiện trong cuộc trò chuyện",
    showAria: "Hiện {title} trong cuộc trò chuyện",
    openConversation: "Mở cuộc trò chuyện của nó",
    openConversationAria: "Mở cuộc trò chuyện của {title}",
    dashboard: "Mở bảng điều khiển runner",
    dashboardAria: "Mở bảng điều khiển runner của {title}"
  },
  bar: {
    tooFast: "Hủy quá nhanh — hãy thử lại sau giây lát.",
    cancelFailed: "Không hủy được tác vụ — hãy dùng nút Dừng toàn cục.",
    runningAria: "Đang chạy: {summary}",
    stoppedOne: "Tín hiệu đã được chấp nhận cho {count} tiến trình. Tiến trình đó có thể vẫn chạy.",
    stoppedMany: "Tín hiệu đã được chấp nhận cho {count} tiến trình. Chúng có thể vẫn chạy.",
    noPid: "Chưa xác nhận tín hiệu nào cho tác vụ này. Kết quả chưa rõ; hãy kiểm tra hoạt động của tác vụ."
  },
  cancelAll: {
    open: "Dừng tất cả công cụ trong phiên này",
    explain: "Thao tác này gửi tín hiệu ngắt đến mọi tiến trình công cụ trong phiên, còn lượt vẫn tiếp tục. Tiến trình có thể bỏ qua tín hiệu hoặc tiếp tục chạy. Hãy kiểm tra trạng thái thực tế sau đó. Các tiến trình công cụ của tác tử con cũng có thể bị ảnh hưởng nếu là tiến trình hậu duệ; một số có thể tiếp tục chạy.",
    confirm: "Gửi tín hiệu ngắt đến tất cả công cụ",
    back: "Quay lại",
    sending: "Đang gửi tín hiệu ngắt…",
    signalled: "Đã nhận phản hồi từ một chủ sở hữu. Tín hiệu không đảm bảo các tiến trình đã dừng; các thao tác khác có thể vẫn đang diễn ra. Hãy kiểm tra hoạt động phiên.",
    capped: "Một chủ sở hữu báo giới hạn tốc độ. Những chủ sở hữu khác vẫn có thể hành động; hãy kiểm tra phiên trước khi thử lại.",
    uncertain: "Chưa rõ kết quả. Tín hiệu vẫn có thể được gửi; hãy kiểm tra phiên trước khi thử lại.",
    refused: "Đã nhận được từ chối từ một bộ máy.",
    unsupported: "Nhà cung cấp này không thể dừng tất cả công cụ trong phiên này.",
    authRefused: "Đã nhận được từ chối xác thực hoặc cấp quyền. Chưa rõ kết quả; hãy kiểm tra hoạt động phiên.",
    ownerUnreachable: "Không liên hệ được chủ sở hữu; chưa xác nhận dừng. Hãy kiểm tra hoạt động phiên.",
    identityChanged: "Không gửi yêu cầu vì không thể xác minh danh tính đã xác thực. Hãy kiểm tra phiên và đăng nhập lại nếu cần.",
    reset: "Tôi đã kiểm tra phiên này — cho phép yêu cầu khác",
  },
  cancel: {
    unsupportedNotice: "Đã nhận được từ chối; trạng thái dừng chưa được xác nhận. Hãy kiểm tra hoạt động phiên.",
    unknownNotice: "Chưa rõ kết quả của yêu cầu dừng này. Hãy kiểm tra hoạt động phiên.",
    alreadyStopped: "đã dừng",
    notStopped: "chưa dừng — hãy dùng nút Dừng toàn cục",
    alreadyStoppedNotice: "Đã dừng — không còn gì đang chạy.",
    retryNotice: "Kết quả chưa được xác nhận. Hãy kiểm tra hoạt động trước khi thử dừng lại tác vụ này.",
    timeoutNotice: "Lệnh dừng không nhận được phản hồi kịp thời — việc dừng vẫn có thể xảy ra.",
    failedNotice: "Không dừng được các công cụ — hãy dùng nút Dừng toàn cục.",
    taskRefusedNotice: "Đã nhận được từ chối; trạng thái dừng chưa được xác nhận. Hãy kiểm tra hoạt động phiên.",
  },
  agent: {
    subAgent: "Sub-agent",
    toolOne: "{count} công cụ",
    toolMany: "{count} công cụ",
    running: "{count} đang chạy",
    runningIndicator: "Agent đang chạy..."
  },
  status: {
    spawning: "đang khởi động",
    running: "đang chạy",
    verifying: "đang xác minh",
    completed: "hoàn tất",
    failed: "thất bại",
    interrupted: "bị ngắt"
  },
  banner: {
    elapsed: "Đã trôi qua",
    cost: "Chi phí",
    ram: "RAM (thường trú)",
    cpu: "CPU",
    pidTitle: "PID {pid} · {threads} luồng · {status}",
    viewAgent: "Xem cuộc trò chuyện của agent này",
    view: "Xem",
    interrupt: "Ngắt agent này",
    runTitle: "Lượt chạy {id}",
    runShort: "chạy {id}",
    wave: "Đợt {wave}",
    openDashboard: "Mở bảng điều khiển runner đầy đủ",
    dashboard: "Bảng điều khiển",
    spawning: "Đang khởi động các agent…",
    noAgents: "Không có agent nào đang hoạt động",
    title: "Chế độ agentic",
    activeOne: "{count} lượt chạy đang hoạt động",
    activeMany: "{count} lượt chạy đang hoạt động",
    cumulative: "tích lũy {cost}"
  },
  pill: {
    title: "Chế độ agentic",
    state: {
      idle: "nhàn rỗi",
      ready: "sẵn sàng",
      running: "đang chạy",
      completed: "hoàn tất"
    },
    workingOne: "Chế độ agentic — {count} agent đang làm việc",
    workingMany: "Chế độ agentic — {count} agent đang làm việc",
    completedOne: "Chế độ agentic — {count} lượt chạy đã hoàn tất",
    completedMany: "Chế độ agentic — {count} lượt chạy đã hoàn tất",
    ready: "Chế độ agentic — sẵn sàng",
    streamingOne: "Hiện có {count} lượt chạy đang phát trực tuyến. Biểu ngữ bên dưới hiển thị các agent theo thời gian thực.",
    streamingMany: "Hiện có {count} lượt chạy đang phát trực tuyến. Biểu ngữ bên dưới hiển thị các agent theo thời gian thực.",
    more: "+ {count} nữa",
    readyNote: "Cuộc trò chuyện này có các kế hoạch được liên kết nhưng hiện không có kế hoạch nào đang phát trực tuyến.",
    ranOne: "{count} lượt chạy đã được khởi chạy từ cuộc trò chuyện này. Hiện không có lượt nào đang phát trực tuyến.",
    ranMany: "{count} lượt chạy đã được khởi chạy từ cuộc trò chuyện này. Hiện không có lượt nào đang phát trực tuyến.",
    openDashboard: "Mở bảng điều khiển runner"
  },
  bg: {
    title: "Hoạt động nền",
    listAria: "Các hoạt động nền",
    noWork: "chỉ có thông báo của nhà cung cấp",
    noticeOne: "{count} thông báo của nhà cung cấp",
    noticeMany: "{count} thông báo của nhà cung cấp",
    noticesAria: "Thông báo của nhà cung cấp — đo từ xa, không có công việc",
    summary: {
      running: "{count} đang chạy",
      queued: "{count} đang chờ",
      failed: "{count} thất bại",
      done: "{count} xong",
      cancelled: "{count} đã hủy",
      ended: "{count} đã kết thúc"
    }
  },
  card: {
    showMore: "Xem thêm",
    showLess: "Thu gọn",
    lineOne: "{count} dòng",
    lineMany: "{count} dòng",
    earlierLineOne: "Hiện {count} dòng trước đó",
    earlierLineMany: "Hiện {count} dòng trước đó",
    progressOf: "Tiến độ của {title}",
    agents: "{settled}/{total} agent",
    agentsOf: "Các agent của {title}",
    tokens: "{count} token",
    toolUseOne: "{count} lần dùng công cụ",
    toolUseMany: "{count} lần dùng công cụ",
    timeline: "Dòng thời gian",
    eventOne: "{count} sự kiện",
    eventMany: "{count} sự kiện",
    eventsOf: "Sự kiện của {title}",
    hiddenEventOne: "… {count} sự kiện trước đó không được giữ lại",
    hiddenEventMany: "… {count} sự kiện trước đó không được giữ lại",
    rawPayload: "Dữ liệu thô",
    parameters: "Tham số",
    latestOutput: "Đầu ra mới nhất",
    output: "Đầu ra",
    result: "Kết quả",
    watched: "Đầu ra được theo dõi",
    outputInFile: "Đầu ra đã vào tệp của tác vụ (ở trên); nhà cung cấp không đưa nó vào luồng.",
    toolsAria: "Công cụ đã gọi",
    kind: {
      workflow: "Workflow",
      shell: "Lệnh nền",
      monitor: "Monitor",
      agent: "Sub-agent",
      message: "Tác nhân nền",
      notice: "Thông báo nhà cung cấp",
      generic: "Hoạt động nền"
    },
    status: {
      running: "Đang chạy",
      queued: "Đang chờ",
      done: "Xong",
      failed: "Thất bại",
      cancelled: "Đã hủy",
      ended: "Đã kết thúc"
    }
  },
  runs: {
    finished: "Đã kết thúc",
    view: "Xem lượt chạy",
    stop: "Dừng lượt chạy",
    loading: "Đang tải các lần thực thi…",
    noDetails: "Không có chi tiết thực thi.",
    inProgressOne: "{count} lượt chạy đang diễn ra",
    inProgressMany: "{count} lượt chạy đang diễn ra",
    completedOne: "{count} lượt chạy đã hoàn tất",
    completedMany: "{count} lượt chạy đã hoàn tất",
    done: "{count} xong"
  },
  work: {
    kind: {
      plan: "kế hoạch",
      task: "tác vụ"
    },
    steps: "bước {done}/{total}",
    openPlan: "Mở kế hoạch {title}",
    openTask: "Mở tác vụ {title}",
    plans: {
      one: "{count} kế hoạch",
      many: "{count} kế hoạch"
    },
    tasks: {
      one: "{count} tác vụ",
      many: "{count} tác vụ"
    },
    barAria: "Đang thực hiện: {summary}",
    barAriaCurrent: "Đang thực hiện: {summary} — tác vụ hiện tại: {title}"
  }
} satisfies Translation<'chatA-activity'>
