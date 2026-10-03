import { describe, expect, it } from 'vitest'
import { splitAttachments } from './messageAttachments'
import { historyEventsToMessages } from './chatAssembly'

const a = { id: 'd1', filename: 'a b.pdf', mime_type: 'application/pdf', size_bytes: 42 }
const block = (list: unknown[]) => `\n\n<po-attachments>${JSON.stringify(list)}</po-attachments>`

describe('splitAttachments', () => {
  it('leaves a plain message alone', () => {
    expect(splitAttachments('hello')).toEqual({ text: 'hello', attachments: [] })
  })

  it('separates the text from the references', () => {
    expect(splitAttachments(`look\n\nplease${block([a])}`)).toEqual({
      text: 'look\n\nplease',
      attachments: [a],
    })
  })

  it('keeps a block that does not parse in the text', () => {
    const broken = 'hi\n\n<po-attachments>nope</po-attachments>'
    expect(splitAttachments(broken)).toEqual({ text: broken, attachments: [] })
  })

  it('does not treat the tag typed mid-message as a block', () => {
    const t = 'about <po-attachments> the tag'
    expect(splitAttachments(t).attachments).toEqual([])
  })
})

describe('history replay', () => {
  it('turns the stored block into attachments on the user message', () => {
    const msgs = historyEventsToMessages([
      { type: 'user_message', content: `hello${block([a])}`, created_at: 1_700_000_000 },
    ] as never)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].blocks[0].content).toBe('hello')
    expect(msgs[0].attachments).toEqual([a])
  })
})
