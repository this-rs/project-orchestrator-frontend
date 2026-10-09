import type { Translation } from '../../catalog.ts'

export default {
  oidc: {
    google: {
      description: 'Tài khoản Google Workspace và Gmail',
    },
    microsoft: {
      description: 'Azure AD và Microsoft 365',
      tenantLabel: 'ID tenant',
      tenantPlaceholder: 'common hoặc ID tenant của bạn',
    },
    okta: {
      description: 'Nền tảng danh tính Okta',
      tenantLabel: 'Tên miền Okta',
      tenantPlaceholder: 'tổ-chức-của-bạn (không có .okta.com)',
    },
    auth0: {
      description: 'Auth0 của Okta',
      tenantLabel: 'Tên miền Auth0',
      tenantPlaceholder: 'tenant-của-bạn (không có .auth0.com)',
    },
    keycloak: {
      description: 'Máy chủ Keycloak tự lưu trữ',
      tenantLabel: 'URL máy chủ',
      tenantPlaceholder: 'https://keycloak.example.com',
    },
    custom: {
      description: 'Bất kỳ nhà cung cấp OpenID Connect nào',
    },
  },
} satisfies Translation<'setupOidc'>
