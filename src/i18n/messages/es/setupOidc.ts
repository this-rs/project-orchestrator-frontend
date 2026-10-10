import type { Translation } from '../../catalog.ts'

export default {
  oidc: {
    google: {
      description: 'Cuentas de Google Workspace y Gmail',
    },
    microsoft: {
      description: 'Azure AD y Microsoft 365',
      tenantLabel: 'ID del inquilino',
      tenantPlaceholder: 'common o tu-id-de-inquilino',
    },
    okta: {
      description: 'Plataforma de identidad Okta',
      tenantLabel: 'Dominio de Okta',
      tenantPlaceholder: 'tu-organización (sin .okta.com)',
    },
    auth0: {
      description: 'Auth0 de Okta',
      tenantLabel: 'Dominio de Auth0',
      tenantPlaceholder: 'tu-inquilino (sin .auth0.com)',
    },
    keycloak: {
      description: 'Servidor Keycloak autoalojado',
      tenantLabel: 'URL del servidor',
      tenantPlaceholder: 'https://keycloak.example.com',
    },
    custom: {
      description: 'Cualquier proveedor OpenID Connect',
    },
  },
} satisfies Translation<'setupOidc'>
