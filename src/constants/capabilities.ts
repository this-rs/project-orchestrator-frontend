// ============================================================================
// CAPABILITIES — what the interface says when a provider cannot do something
// ============================================================================
//
// An absent capability never leaves a control that silently does nothing: the
// control is removed or disabled, and one of these sentences says why.

export const POLICY_ONLY_TEXT = 'Policy only: tools that would need approval are denied.'
export const POLICY_ONLY_DETAIL =
  'This provider cannot pause a tool call to ask you. The tool policy decides alone.'
export const POLICY_ONLY_REQUEST_TEXT = 'Not asked: this provider applies the tool policy without prompting.'

export const IMAGES_UNSUPPORTED_TEXT = 'This model does not accept images.'
export function imagesRefusedText(filenames: readonly string[]): string {
  const names = filenames.join(', ')
  return `${IMAGES_UNSUPPORTED_TEXT} Not attached: ${names}.`
}

export const TOOL_CANCEL_UNSUPPORTED_TEXT =
  'This provider cannot stop a single tool. Use Stop in the composer to interrupt the whole turn.'

export const RESUME_UNSUPPORTED_TEXT =
  'This provider cannot resume a conversation. Start a new conversation to continue.'
