import type { Translation } from '../../catalog.ts'

export default {
  oidc: {
    google: {
      description: 'Comptes Google Workspace et Gmail',
    },
    microsoft: {
      description: 'Azure AD et Microsoft 365',
      tenantLabel: 'ID du tenant',
      tenantPlaceholder: 'common ou l\'ID de votre tenant',
    },
    okta: {
      description: 'Plateforme d\'identité Okta',
      tenantLabel: 'Domaine Okta',
      tenantPlaceholder: 'votre-organisation (sans .okta.com)',
    },
    auth0: {
      description: 'Auth0 par Okta',
      tenantLabel: 'Domaine Auth0',
      tenantPlaceholder: 'votre-tenant (sans .auth0.com)',
    },
    keycloak: {
      description: 'Serveur Keycloak auto-hébergé',
      tenantLabel: 'URL du serveur',
      tenantPlaceholder: 'https://keycloak.example.com',
    },
    custom: {
      description: 'Tout fournisseur OpenID Connect',
    },
  },
} satisfies Translation<'setupOidc'>
