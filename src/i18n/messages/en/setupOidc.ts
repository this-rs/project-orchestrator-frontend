export default {
  oidc: {
    google: {
      description: 'Google Workspace & Gmail accounts',
    },
    microsoft: {
      description: 'Azure AD & Microsoft 365',
      tenantLabel: 'Tenant ID',
      tenantPlaceholder: 'common or your-tenant-id',
    },
    okta: {
      description: 'Okta identity platform',
      tenantLabel: 'Okta Domain',
      tenantPlaceholder: 'your-org (without .okta.com)',
    },
    auth0: {
      description: 'Auth0 by Okta',
      tenantLabel: 'Auth0 Domain',
      tenantPlaceholder: 'your-tenant (without .auth0.com)',
    },
    keycloak: {
      description: 'Self-hosted Keycloak server',
      tenantLabel: 'Server URL',
      tenantPlaceholder: 'https://keycloak.example.com',
    },
    custom: {
      description: 'Any OpenID Connect provider',
    },
  },
} as const
