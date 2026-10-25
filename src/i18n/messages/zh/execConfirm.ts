import type { Translation } from '../../catalog.ts'

export default {
  aria: '允许任务在此文件夹中运行',
  title: '在此文件夹中运行？',
  hint: '在你回答之前不会启动任何东西。只有你可以授权。',
  allow: '允许',
  reject: '拒绝',
  state: {
    confirmed: '已确认：任务正在启动。',
    rejected: '已拒绝：未运行任何内容。',
    expired: '已过期：请重新发起委派。',
  },
  error: {
    forbidden: '只有此请求的所有者才能回答。',
    conflict: '此请求已被回答或已不再匹配。',
    other: '无法发送回答',
  },
} satisfies Translation<'execConfirm'>
