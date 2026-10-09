import type { Translation } from '../../catalog.ts'

export default {
  oidc: {
    google: {
      description: 'Аккаунты Google Workspace и Gmail',
    },
    microsoft: {
      description: 'Azure AD и Microsoft 365',
      tenantLabel: 'ID тенанта',
      tenantPlaceholder: 'common или your-tenant-id',
    },
    okta: {
      description: 'Платформа идентификации Okta',
      tenantLabel: 'Домен Okta',
      tenantPlaceholder: 'your-org (без .okta.com)',
    },
    auth0: {
      description: 'Auth0 от Okta',
      tenantLabel: 'Домен Auth0',
      tenantPlaceholder: 'your-tenant (без .auth0.com)',
    },
    keycloak: {
      description: 'Собственный сервер Keycloak',
      tenantLabel: 'URL сервера',
      tenantPlaceholder: 'https://keycloak.example.com',
    },
    custom: {
      description: 'Любой провайдер OpenID Connect',
    },
  },
} satisfies Translation<'setupOidc'>
