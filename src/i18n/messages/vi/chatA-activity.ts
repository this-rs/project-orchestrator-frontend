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
    stoppedOne: "Đã dừng {count} tiến trình con.",
    stoppedMany: "Đã dừng {count} tiến trình con.",
    noPid: "Đã ghi nhận yêu cầu hủy nhưng không biết PID của tiến trình con — nếu tín hiệu vẫn tiếp tục đến, hãy dùng nút Dừng toàn cục."
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
    kind: {
      workflow: "Workflow",
      shell: "Lệnh nền",
      monitor: "Monitor",
      agent: "Sub-agent",
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
  }
} satisfies Translation<'chatA-activity'>
