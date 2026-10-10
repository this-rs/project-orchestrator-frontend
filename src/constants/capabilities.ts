// ============================================================================
// CAPABILITIES — what the interface says when a provider cannot do something
// ============================================================================
//
// An absent capability never leaves a control that silently does nothing: the
// control is removed or disabled, and one of these sentences says why.

import { tr } from '@/i18n/lazy'

export const policyOnlyText = (): string => tr('providers.capabilities.policyOnly')
export const policyOnlyDetail = (): string => tr('providers.capabilities.policyOnlyDetail')
export const policyOnlyRequestText = (): string => tr('providers.capabilities.policyOnlyRequest')

// Images refused at the composer: `session.images.model` / `session.images.harness`
// (i18n), chosen by `chatSessionImagesCauseAtom`: a model that takes no image is
// not the same story as an engine that does not pass images yet.

export const toolCancelUnsupportedText = (): string => tr('providers.capabilities.toolCancelUnsupported')

export const resumeUnsupportedText = (): string => tr('providers.capabilities.resumeUnsupported')
