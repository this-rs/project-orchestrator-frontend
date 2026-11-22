import { expect, it, vi } from 'vitest'

const plugin = vi.hoisted(() => ({
  send: vi.fn(),
  disconnect: vi.fn(),
  addListener: vi.fn(() => () => {}),
}))
vi.mock('../env', () => ({ isTauri: true }))
vi.mock('@tauri-apps/plugin-websocket', () => ({
  default: { connect: vi.fn().mockResolvedValue(plugin) },
}))

import { createWebSocket } from '../wsAdapter'

it('sends Tauri frames in order before disconnecting', async () => {
  let completeFirst!: () => void
  plugin.send.mockImplementationOnce(() => new Promise<void>((resolve) => { completeFirst = resolve }))
    .mockResolvedValueOnce(undefined)
  plugin.disconnect.mockResolvedValue(undefined)
  const socket = await createWebSocket('ws://localhost/chat')
  socket.send('first')
  socket.send('second')
  socket.close()
  await Promise.resolve()
  expect(plugin.send).toHaveBeenCalledTimes(1)
  expect(plugin.disconnect).not.toHaveBeenCalled()
  completeFirst()
  await vi.waitFor(() => expect(plugin.disconnect).toHaveBeenCalledOnce())
  expect(plugin.send.mock.calls.map(([message]) => message)).toEqual(['first', 'second'])
})
