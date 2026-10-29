import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReadToolRenderer } from './ReadToolRenderer'
import { DefaultToolRenderer } from './DefaultToolRenderer'
import { toolResultImages } from './toolResultImages'

const PNG = 'iVBORw0KGgo='
const imageBlock = (mediaType: string, data: string = PNG) =>
  ({ type: 'image', source: { type: 'base64', media_type: mediaType, data } })

describe('toolResultImages', () => {
  it('reads an image block of a Read result', () => {
    const content = JSON.stringify([imageBlock('image/png')])
    expect(toolResultImages(content)).toEqual([{ mediaType: 'image/png', data: PNG }])
  })

  it('reads a single block that is not wrapped in an array', () => {
    expect(toolResultImages(JSON.stringify(imageBlock('image/jpeg')))).toEqual([
      { mediaType: 'image/jpeg', data: PNG },
    ])
  })

  it('keeps every image of a result, in order, and skips text blocks', () => {
    const content = JSON.stringify([
      { type: 'text', text: 'two pictures' },
      imageBlock('image/png'),
      imageBlock('image/webp', 'UklGRg=='),
    ])
    expect(toolResultImages(content).map((i) => i.mediaType)).toEqual(['image/png', 'image/webp'])
  })

  it('refuses plain text, invalid JSON and absent content', () => {
    expect(toolResultImages(undefined)).toEqual([])
    expect(toolResultImages('')).toEqual([])
    expect(toolResultImages('the file is 2 KB, see image/png below')).toEqual([])
    expect(toolResultImages('[{"type":"image"')).toEqual([])
  })

  it('refuses SVG and any media type a browser should not decode from a result', () => {
    expect(toolResultImages(JSON.stringify([imageBlock('image/svg+xml')]))).toEqual([])
    expect(toolResultImages(JSON.stringify([imageBlock('text/html')]))).toEqual([])
  })

  it('refuses a payload that is a data URL or contains whitespace', () => {
    expect(toolResultImages(JSON.stringify([imageBlock('image/png', 'data:image/png;base64,AAAA')]))).toEqual([])
    expect(toolResultImages(JSON.stringify([imageBlock('image/png', 'AAAA BBBB')]))).toEqual([])
  })

  it('refuses a source that is not base64', () => {
    const block = { type: 'image', source: { type: 'url', media_type: 'image/png', data: PNG } }
    expect(toolResultImages(JSON.stringify([block]))).toEqual([])
  })
})

describe('ReadToolRenderer on an image', () => {
  it('shows the picture and not its base64 text', () => {
    const { container } = render(
      <ReadToolRenderer
        toolName="Read"
        toolInput={{ file_path: '/tmp/shot.png' }}
        resultContent={JSON.stringify([imageBlock('image/png')])}
        isLoading={false}
      />,
    )
    const img = screen.getByTestId('tool-result-image') as HTMLImageElement
    expect(img.getAttribute('src')).toBe(`data:image/png;base64,${PNG}`)
    expect(img.getAttribute('alt')).toBe('/tmp/shot.png')
    expect(container.textContent).not.toContain(PNG)
  })

  it('keeps the text view for a text file', () => {
    const { container } = render(
      <ReadToolRenderer
        toolName="Read"
        toolInput={{ file_path: 'a.ts' }}
        resultContent={'const a = 1'}
        isLoading={false}
      />,
    )
    expect(screen.queryByTestId('tool-result-image')).toBeNull()
    expect(container.textContent).toContain('const a = 1')
  })

  it('shows the error text, not a picture, when the read failed', () => {
    render(
      <ReadToolRenderer
        toolName="Read"
        toolInput={{ file_path: 'shot.png' }}
        resultContent={JSON.stringify([imageBlock('image/png')])}
        isError
        isLoading={false}
      />,
    )
    expect(screen.queryByTestId('tool-result-image')).toBeNull()
  })
})

describe('DefaultToolRenderer on an image', () => {
  it('shows a picture returned by a tool that has no dedicated renderer', () => {
    render(
      <DefaultToolRenderer
        toolName="mcp__x__screenshot"
        toolInput={{}}
        resultContent={JSON.stringify([imageBlock('image/gif')])}
        isLoading={false}
      />,
    )
    expect(screen.getByTestId('tool-result-image').getAttribute('src')).toBe(`data:image/gif;base64,${PNG}`)
  })
})
