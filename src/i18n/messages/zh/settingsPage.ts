import type { Translation } from '../../catalog.ts'

export default {
  back: "返回",
  settings: {
    title: "设置",
    description: "桌面应用设置。它们适用于与助手的所有对话。",
    chatTitle: "聊天与 AI",
    chatDescription: "权限模式、允许和拒绝的工具、环境变量，以及助手使用的 Claude Code CLI。",
    updatesTitle: "更新",
    updatesDescription: "检查桌面应用是否有新版本并安装。",
    providersNote: "提供方（实例、项目授权、角色和模型策略）有专属页面：",
    providersLink: "提供方 → /providers",
    explain: {
      what: "设置是桌面应用本身的选项：助手可以如何在这台机器上操作，以及应用如何更新。",
      why: "您只需决定一次：助手可以运行什么、可以使用哪些工具，以及您使用哪个版本。",
      different: "如今这些选项分散在配置文件和终端参数中。这里集中在一个界面，适用于每个对话。",
    },
  },
  providers: {
    title: "提供方",
    description: "您的对话在哪里运行、每个项目可以向那里发送什么，以及哪个模型负责什么。",
    explain: {
      what: "由您选择 AI：内置 Claude Code，您也可以注册其他提供方，并逐个项目授权。",
      why: "您为每个对话选择提供方和模型，密钥从不在表单中输入：它保存在保险库中。",
      different: "如今一个工具对应一个模型。这里的对话固定在其提供方上，委派任务的助手可以为该任务指定提供方和模型。",
    },
  },
} satisfies Translation<'settingsPage'>
