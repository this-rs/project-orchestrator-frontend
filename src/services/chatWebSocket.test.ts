/**
 * Tests for ChatWebSocket — dormant mode behavior.
 *
 * Verifies that the WebSocket client correctly handles the `session_dormant`
 * event (CLI idle cleanup) without disconnecting, and that `session_closed`
 * still triggers a proper disconnect.
 *
 * Run with: npx vitest run src/services/chatWebSocket.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChatWebSocket } from './chatWebSocket'
import type { WsConnectionStatus } from '@/types'

// ---------------------------------------------------------------------------
// Helpers: mock the WebSocket adapter to simulate server messages
// ---------------------------------------------------------------------------

/** Simulate `createWebSocket` — captures callbacks and returns a controllable mock. */
function mockCreateWebSocket() {
  let capturedCallbacks: {
    onopen?: (ev: Event) => void
    onmessage?: (ev: MessageEvent) => void
    onclose?: (ev: CloseEvent) => void
    onerror?: (ev: Event) => void
  } = {}

  const mockWs = {
    readyState: 1, // OPEN
    onopen: null as ((ev: Event) => void) | null,
    onmessage: null as ((ev: MessageEvent) => void) | null,
    onclose: null as ((ev: CloseEvent) => void) | null,
    onerror: null as ((ev: Event) => void) | null,
    send: vi.fn(),
    close: vi.fn(),
  }

  // Intercept createWebSocket to capture callbacks and return mock
  vi.doMock('./wsAdapter', () => ({
    createWebSocket: vi.fn(async (_url: string, callbacks: typeof capturedCallbacks) => {
      capturedCallbacks = callbacks ?? {}
      return mockWs
    }),
    ReadyState: { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 },
  }))

  // Intercept auth (no-op for tests)
  vi.doMock('./auth', () => ({
    getAuthMode: () => 'none',
    fetchWsTicket: async () => null,
  }))

  vi.doMock('./authManager', () => ({
    forceLogout: vi.fn(),
  }))

  vi.doMock('./env', () => ({
    wsUrl: (path: string) => `ws://localhost:6600${path}`,
  }))

  return {
    mockWs,
    /** Simulate server sending a JSON message */
    serverSend(data: Record<string, unknown>) {
      const event = new MessageEvent('message', { data: JSON.stringify(data) })
      // Use captured callback or assigned handler
      if (capturedCallbacks.onmessage) {
        capturedCallbacks.onmessage(event)
      } else if (mockWs.onmessage) {
        mockWs.onmessage(event)
      }
    },
    /** Simulate the connection opening */
    triggerOpen() {
      const event = new Event('open')
      if (capturedCallbacks.onopen) capturedCallbacks.onopen(event)
    },
    /** Simulate the connection closing */
    triggerClose() {
      const event = new CloseEvent('close')
      if (capturedCallbacks.onclose) capturedCallbacks.onclose(event)
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatWebSocket — dormant mode', () => {
  let ws: ChatWebSocket
  let mock: ReturnType<typeof mockCreateWebSocket>
  let statusHistory: WsConnectionStatus[]

  beforeEach(async () => {
    vi.resetModules()
    mock = mockCreateWebSocket()

    // Dynamic import after mocks are set up
    const mod = await import('./chatWebSocket')
    ws = new mod.ChatWebSocket()

    statusHistory = []
    ws.setCallbacks({
      onStatusChange: (status) => statusHistory.push(status),
    })

    // Connect and authenticate
    await ws.connect('test-session-id', 0)
    mock.triggerOpen()
    mock.serverSend({ type: 'auth_ok' })
  })

  it('should be connected after auth_ok', () => {
    expect(ws.status).toBe('connected')
    expect(statusHistory).toContain('connected')
  })

  it('should stay connected on session_dormant (CLI idle cleanup)', () => {
    mock.serverSend({
      type: 'session_dormant',
      message: 'CLI session cleaned up (idle timeout). Will resume on next message.',
    })

    // Status should NOT change — WS is still alive
    expect(ws.status).toBe('connected')
    // No 'disconnected' or 'reconnecting' in history after dormant
    const postAuth = statusHistory.slice(statusHistory.indexOf('connected') + 1)
    expect(postAuth).not.toContain('disconnected')
    expect(postAuth).not.toContain('reconnecting')
  })

  it('should still be able to send messages after session_dormant', () => {
    mock.serverSend({ type: 'session_dormant', message: 'idle cleanup' })

    // User sends a message — should succeed (WS is open)
    const sent = ws.sendUserMessage('Hello after dormant')
    expect(sent).toBe(true)
    expect(mock.mockWs.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'user_message', content: 'Hello after dormant' }),
    )
  })

  it('should disconnect on session_closed (explicit close)', () => {
    mock.serverSend({ type: 'session_closed', message: 'Session has been closed' })

    expect(ws.status).toBe('disconnected')
    expect(statusHistory).toContain('disconnected')
  })

  it('should not reconnect after session_closed', () => {
    mock.serverSend({ type: 'session_closed', message: 'closed' })

    // Trigger the WS close event (server closes connection)
    mock.triggerClose()

    // Status should stay disconnected (no reconnecting)
    expect(ws.status).toBe('disconnected')
    expect(statusHistory).not.toContain('reconnecting')
  })

  it('should not forward session_dormant as a ChatEvent to callback', () => {
    const events: Array<{ type: string }> = []
    ws.setCallbacks({ onEvent: (ev) => events.push(ev) })

    mock.serverSend({ type: 'session_dormant', message: 'idle cleanup' })

    // session_dormant should NOT reach the event callback
    expect(events).toHaveLength(0)
  })

  it('should not forward session_closed as a ChatEvent to callback', () => {
    const events: Array<{ type: string }> = []
    ws.setCallbacks({ onEvent: (ev) => events.push(ev) })

    mock.serverSend({ type: 'session_closed', message: 'closed' })

    expect(events).toHaveLength(0)
  })

  it('should forward regular events after session_dormant', () => {
    const events: Array<{ type: string }> = []
    ws.setCallbacks({ onEvent: (ev) => events.push(ev) })

    // Go dormant
    mock.serverSend({ type: 'session_dormant', message: 'idle cleanup' })

    // Then receive a real event (after resume_session on backend)
    mock.serverSend({ type: 'streaming_status', is_streaming: true, seq: 1 })

    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('streaming_status')
  })
})

describe('ChatWebSocket — session_dormant vs session_closed ordering', () => {
  it('session_dormant followed by normal events should work', async () => {
    vi.resetModules()
    const mock = mockCreateWebSocket()
    const mod = await import('./chatWebSocket')
    const ws = new mod.ChatWebSocket()

    const statuses: WsConnectionStatus[] = []
    const events: Array<{ type: string }> = []
    ws.setCallbacks({
      onStatusChange: (s) => statuses.push(s),
      onEvent: (ev) => events.push(ev),
    })

    await ws.connect('session-2', 0)
    mock.triggerOpen()
    mock.serverSend({ type: 'auth_ok' })
    mock.serverSend({ type: 'replay_complete' })

    // Simulate dormant → then resumed stream
    mock.serverSend({ type: 'session_dormant', message: 'idle' })
    mock.serverSend({ type: 'stream_delta', text: 'Hello', seq: 1 })
    mock.serverSend({ type: 'stream_delta', text: ' world', seq: 2 })

    expect(ws.status).toBe('connected')
    expect(events).toHaveLength(2)
    expect(events[0].type).toBe('stream_delta')
    expect(events[1].type).toBe('stream_delta')
  })
})
