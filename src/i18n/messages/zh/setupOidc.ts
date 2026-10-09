import type { Translation } from '../../catalog.ts'

export default {
  oidc: {
    google: {
      description: 'Google Workspace 和 Gmail 账户',
    },
    microsoft: {
      description: 'Azure AD 和 Microsoft 365',
      tenantLabel: '租户 ID',
      tenantPlaceholder: 'common 或你的租户 ID',
    },
    okta: {
      description: 'Okta 身份平台',
      tenantLabel: 'Okta 域名',
      tenantPlaceholder: 'your-org（不含 .okta.com）',
    },
    auth0: {
      description: 'Okta 旗下的 Auth0',
      tenantLabel: 'Auth0 域名',
      tenantPlaceholder: 'your-tenant（不含 .auth0.com）',
    },
    keycloak: {
      description: '自托管的 Keycloak 服务器',
      tenantLabel: '服务器 URL',
      tenantPlaceholder: 'https://keycloak.example.com',
    },
    custom: {
      description: '任何 OpenID Connect 提供方',
    },
  },
} satisfies Translation<'setupOidc'>
