import type { Translation } from '../../catalog.ts'

export default {
  title: 'API Tokens',
  description: 'Long-lived tokens for programmatic access to the API. A token works like a password — keep it secret.',
  explain: {
    what: 'An API token lets an external service call your Project Orchestrator on your behalf.',
    why: 'Scripts, CI pipelines and other tools can read plans, notes and decisions without a browser session.',
    different: 'Today you need a browser login. With a token, a curl command or a script works the same way.',
  },
  empty: 'No API tokens yet.',
  emptyHint: 'Create one to start using the API from external services.',
  create: {
    title: 'New token',
    label: 'Label',
    labelPlaceholder: 'e.g. CI pipeline, monitoring script',
    labelRequired: 'A label is required.',
    expiryDays: 'Expires after (days)',
    expiryHelp: 'Between 1 and 365 days. Default: 90.',
    submit: 'Create token',
    creating: 'Creating…',
  },
  reveal: {
    title: 'Token created',
    warning: 'Copy this token now — it will not be shown again.',
    copied: 'Copied to clipboard.',
    copy: 'Copy',
    done: 'Done',
  },
  table: {
    label: 'Label',
    scope: 'Scope',
    created: 'Created',
    expires: 'Expires',
    status: 'Status',
    actions: 'Actions',
  },
  status: {
    active: 'Active',
    revoked: 'Revoked',
    expired: 'Expired',
  },
  revoke: {
    button: 'Revoke',
    confirm: 'Revoke this token? It will stop working immediately.',
    title: 'Revoke token',
    success: 'Token revoked.',
  },
  purge: {
    button: 'Purge expired & revoked',
    success: '{count} dead token(s) removed.',
    none: 'Nothing to purge.',
  },
  errors: {
    loadFailed: 'Failed to load tokens.',
    createFailed: 'Failed to create token.',
    revokeFailed: 'Failed to revoke token.',
    purgeFailed: 'Failed to purge tokens.',
  },
} satisfies Translation<'apiTokens'>
