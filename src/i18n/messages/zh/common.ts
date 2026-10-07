import type { Translation } from '../../catalog.ts'

export default {
  language: {
    label: "语言",
    choose: "选择语言",
    current: "语言：{name}",
    description: "界面语言。你的选择会保存在此设备上。",
  },
} satisfies Translation<'common'>
