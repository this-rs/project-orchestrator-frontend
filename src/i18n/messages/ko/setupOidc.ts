import type { Translation } from '../../catalog.ts'

export default {
  oidc: {
    google: {
      description: 'Google Workspace 및 Gmail 계정',
    },
    microsoft: {
      description: 'Azure AD 및 Microsoft 365',
      tenantLabel: '테넌트 ID',
      tenantPlaceholder: 'common 또는 your-tenant-id',
    },
    okta: {
      description: 'Okta 아이덴티티 플랫폼',
      tenantLabel: 'Okta 도메인',
      tenantPlaceholder: 'your-org(.okta.com 제외)',
    },
    auth0: {
      description: 'Okta의 Auth0',
      tenantLabel: 'Auth0 도메인',
      tenantPlaceholder: 'your-tenant(.auth0.com 제외)',
    },
    keycloak: {
      description: '자체 호스팅 Keycloak 서버',
      tenantLabel: '서버 URL',
      tenantPlaceholder: 'https://keycloak.example.com',
    },
    custom: {
      description: '모든 OpenID Connect 제공자',
    },
  },
} satisfies Translation<'setupOidc'>
