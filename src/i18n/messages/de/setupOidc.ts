import type { Translation } from '../../catalog.ts'

export default {
  oidc: {
    google: {
      description: 'Google-Workspace- und Gmail-Konten',
    },
    microsoft: {
      description: 'Azure AD und Microsoft 365',
      tenantLabel: 'Tenant-ID',
      tenantPlaceholder: 'common oder Ihre-Tenant-ID',
    },
    okta: {
      description: 'Okta-Identitätsplattform',
      tenantLabel: 'Okta-Domain',
      tenantPlaceholder: 'ihre-organisation (ohne .okta.com)',
    },
    auth0: {
      description: 'Auth0 von Okta',
      tenantLabel: 'Auth0-Domain',
      tenantPlaceholder: 'ihr-tenant (ohne .auth0.com)',
    },
    keycloak: {
      description: 'Selbst gehosteter Keycloak-Server',
      tenantLabel: 'Server-URL',
      tenantPlaceholder: 'https://keycloak.example.com',
    },
    custom: {
      description: 'Beliebiger OpenID-Connect-Anbieter',
    },
  },
} satisfies Translation<'setupOidc'>
