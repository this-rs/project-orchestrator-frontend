import type { Translation } from '../../catalog.ts'

export default {
  oidc: {
    google: {
      description: 'حسابات Google Workspace وGmail',
    },
    microsoft: {
      description: 'Azure AD وMicrosoft 365',
      tenantLabel: 'معرّف المستأجر',
      tenantPlaceholder: 'common أو معرّف مستأجرك',
    },
    okta: {
      description: 'منصة الهوية Okta',
      tenantLabel: 'نطاق Okta',
      tenantPlaceholder: 'your-org (بدون .okta.com)',
    },
    auth0: {
      description: 'Auth0 من Okta',
      tenantLabel: 'نطاق Auth0',
      tenantPlaceholder: 'your-tenant (بدون .auth0.com)',
    },
    keycloak: {
      description: 'خادم Keycloak مستضاف ذاتيًا',
      tenantLabel: 'عنوان الخادم',
      tenantPlaceholder: 'https://keycloak.example.com',
    },
    custom: {
      description: 'أي مزوّد OpenID Connect',
    },
  },
} satisfies Translation<'setupOidc'>
