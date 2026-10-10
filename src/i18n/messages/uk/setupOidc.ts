import type { Translation } from '../../catalog.ts'

export default {
  oidc: {
    google: {
      description: 'Облікові записи Google Workspace і Gmail',
    },
    microsoft: {
      description: 'Azure AD і Microsoft 365',
      tenantLabel: 'ID тенанта',
      tenantPlaceholder: 'common або ID вашого тенанта',
    },
    okta: {
      description: 'Платформа ідентифікації Okta',
      tenantLabel: 'Домен Okta',
      tenantPlaceholder: 'your-org (без .okta.com)',
    },
    auth0: {
      description: 'Auth0 від Okta',
      tenantLabel: 'Домен Auth0',
      tenantPlaceholder: 'your-tenant (без .auth0.com)',
    },
    keycloak: {
      description: 'Власний сервер Keycloak',
      tenantLabel: 'URL сервера',
      tenantPlaceholder: 'https://keycloak.example.com',
    },
    custom: {
      description: 'Будь-який провайдер OpenID Connect',
    },
  },
} satisfies Translation<'setupOidc'>
