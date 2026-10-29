/**
 * DefaultToolRenderer — fallback renderer for unrecognized tools.
 *
 * Displays the raw JSON input and result, exactly like the original
 * ToolCallBlock inline rendering. Used as the fallback when no
 * specialized renderer is registered for a tool name.
 */

import { useT } from '@/i18n'
import type { ToolRendererProps } from './types'
import { toolImageDataUrl, toolResultImages } from './toolResultImages'

/**
 * The parameters of a tool call, as JSON.
 *
 * One copy, shared by both branches below: the image branch and the text branch
 * differ ONLY in what they do with the result, and a second copy of this block
 * is how the two drift apart.
 */
function ToolInput({ toolInput }: { toolInput: ToolRendererProps['toolInput'] }) {
  const { t } = useT()
  if (Object.keys(toolInput).length === 0) return null
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-600 mb-1">{t('chatA-tools.default.input')}</div>
      <pre className="text-xs text-gray-500 bg-black/20 rounded p-2 overflow-x-auto max-h-40 overflow-y-auto">
        {JSON.stringify(toolInput, null, 2)}
      </pre>
    </div>
  )
}

export function DefaultToolRenderer({ toolInput, resultContent, isError, isLoading }: ToolRendererProps) {
  const { t } = useT()
  // A result that carries pictures (an MCP tool returning a screenshot) shows
  // them; its base64 text is not printed as a wall of characters.
  const images = !isLoading && !isError ? toolResultImages(resultContent) : []
  if (images.length > 0) {
    return (
      <div className="space-y-2">
        <ToolInput toolInput={toolInput} />
        <div className="space-y-2">
          {images.map((image, i) => (
            <img
              key={i}
              data-testid="tool-result-image"
              src={toolImageDataUrl(image)}
              alt="image"
              className="block max-w-full max-h-96 h-auto rounded border border-white/[0.06] bg-black/30 object-contain"
            />
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <ToolInput toolInput={toolInput} />
      {!isLoading && resultContent != null && (
        <div>
          <div className={`text-[10px] uppercase tracking-wider mb-1 ${isError ? 'text-red-400' : 'text-gray-600'}`}>
            {isError ? t('chatA-tools.default.error') : t('chatA-tools.default.result')}
          </div>
          <pre className={`text-xs rounded p-2 overflow-x-auto max-h-40 overflow-y-auto ${isError ? 'text-red-400 bg-red-900/10' : 'text-gray-500 bg-black/20'}`}>
            {resultContent.length > 2000
              ? resultContent.slice(0, 2000) + `\n${t('chatA-tools.default.truncated')}`
              : resultContent}
          </pre>
        </div>
      )}
    </div>
  )
}
