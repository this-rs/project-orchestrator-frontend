export default {
  back: "Back",
  settings: {
    title: "Settings",
    description: "Desktop app settings. They apply to every conversation with the assistants.",
    chatTitle: "Chat & AI",
    chatDescription: "Permission mode, allowed and denied tools, environment variables and the Claude Code CLI used by the assistants.",
    updatesTitle: "Updates",
    updatesDescription: "Check for a new version of the desktop app and install it.",
    providersNote: "Providers (instances, project consent, roles and model policy) have their own page:",
    providersLink: "Providers → /providers",
    explain: {
      what: "Settings are the choices of the desktop app itself: how assistants may act on this machine, and how the app updates.",
      why: "You decide once what an assistant may run, which tools it may use and which version you are on.",
      different: "Today these choices are spread across config files and terminal flags. Here they are one screen, applied to every conversation.",
    },
  },
  providers: {
    title: "Providers",
    description: "Where your conversations run, what each project may send there, and which model does what.",
    explain: {
      what: "Your choice of AI: Claude Code is built in, and you can register another provider and allow it project by project.",
      why: "You pick the provider and the model for a conversation, and a key is never typed into a form: it stays in the vault.",
      different: "Today one tool means one model. Here a conversation stays on its provider, and the assistant that delegates a task can name the provider and the model for it.",
    },
  },
} as const
