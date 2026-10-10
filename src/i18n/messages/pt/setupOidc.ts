import type { Translation } from '../../catalog.ts'

export default {
  oidc: {
    google: {
      description: 'Contas Google Workspace e Gmail',
    },
    microsoft: {
      description: 'Azure AD e Microsoft 365',
      tenantLabel: 'ID do tenant',
      tenantPlaceholder: 'common ou o-id-do-seu-tenant',
    },
    okta: {
      description: 'Plataforma de identidade Okta',
      tenantLabel: 'Domínio Okta',
      tenantPlaceholder: 'sua-organizacao (sem .okta.com)',
    },
    auth0: {
      description: 'Auth0 da Okta',
      tenantLabel: 'Domínio Auth0',
      tenantPlaceholder: 'seu-tenant (sem .auth0.com)',
    },
    keycloak: {
      description: 'Servidor Keycloak hospedado por você',
      tenantLabel: 'URL do servidor',
      tenantPlaceholder: 'https://keycloak.example.com',
    },
    custom: {
      description: 'Qualquer provedor OpenID Connect',
    },
  },
} satisfies Translation<'setupOidc'>
