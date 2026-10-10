import type { Translation } from '../../catalog.ts'

export default {
  oidc: {
    google: {
      description: 'Google Workspace と Gmail のアカウント',
    },
    microsoft: {
      description: 'Azure AD と Microsoft 365',
      tenantLabel: 'テナント ID',
      tenantPlaceholder: 'common またはお使いのテナント ID',
    },
    okta: {
      description: 'Okta の ID プラットフォーム',
      tenantLabel: 'Okta ドメイン',
      tenantPlaceholder: 'your-org（.okta.com は不要）',
    },
    auth0: {
      description: 'Okta の Auth0',
      tenantLabel: 'Auth0 ドメイン',
      tenantPlaceholder: 'your-tenant（.auth0.com は不要）',
    },
    keycloak: {
      description: 'セルフホストの Keycloak サーバー',
      tenantLabel: 'サーバー URL',
      tenantPlaceholder: 'https://keycloak.example.com',
    },
    custom: {
      description: '任意の OpenID Connect プロバイダー',
    },
  },
} satisfies Translation<'setupOidc'>
