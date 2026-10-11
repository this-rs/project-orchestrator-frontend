import type { Translation } from '../../catalog.ts'

export default {
  ask: {
    answered: "已回答：",
    placeholder: "或输入你的回答...",
    submit: "提交",
    notSent: "未发送：连接已断开。你的回答已保留，重新连接后请再试一次。"
  },
  attachments: {
    processing: "处理中…",
    remove: "移除",
    removeAria: "移除 {name}",
    pendingSend: "上传完成后将发送消息"
  },
  upload: {
    network: "网络错误——文件未到达服务器",
    timeout: "服务器未及时响应——请移除文件后重新添加",
    tooLarge: "文件过大",
    unsupported: "不支持的文件格式",
    unreadable: "无法读取文件（格式错误或已损坏）",
    forbidden: "不允许在此处上传",
    failed: "上传失败（HTTP {status}）"
  },
  action: {
    send: "发送消息",
    stop: "停止生成",
    stopping: "正在停止…",
    waiting: "正在等待附件上传完成",
    idle: "发送消息",
    removeFailed: "请先移除上传失败的附件",
    waitingUpload: "正在等待上传完成"
  },
  composer: {
    imageName: "图片",
    alreadyIn: "{label} 已在消息中。",
    added: "已将 {label} 添加到消息。",
    close: "关闭",
    maxRefs: "每条消息最多 {max} 个引用：最后一个未添加。",
    references: "引用",
    placeholder: "发送消息...",
    attach: "附加文件",
    override: "（覆盖）",
    default: "默认",
    auto: "自动",
    autoOn: "已启用自动继续",
    autoOff: "已禁用自动继续",
    drop: "拖放到此处以附加"
  },
  refs: {
    picker: {
      all: "全部",
      filterByKind: "按类型筛选",
      hintActors: "角色",
      hintSearch: "搜索",
      kindOnly: "仅{kind}",
      resultsOne: "{count} 个结果",
      resultsMany: "{count} 个结果",
      noResults: "无结果",
      searching: "正在搜索…",
      noActors: "此服务器上没有可用的角色",
      needsProject: "选择一个项目以搜索角色设定和技能",
      close: "关闭引用"
    }
  }
} satisfies Translation<'chatA-input'>
