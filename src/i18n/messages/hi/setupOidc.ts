import type { Translation } from '../../catalog.ts'

export default {
  oidc: {
    google: {
      description: 'Google Workspace और Gmail खाते',
    },
    microsoft: {
      description: 'Azure AD और Microsoft 365',
      tenantLabel: 'टेनेंट आईडी',
      tenantPlaceholder: 'common या आपकी-टेनेंट-आईडी',
    },
    okta: {
      description: 'Okta पहचान प्लेटफ़ॉर्म',
      tenantLabel: 'Okta डोमेन',
      tenantPlaceholder: 'आपका-संगठन (.okta.com के बिना)',
    },
    auth0: {
      description: 'Okta का Auth0',
      tenantLabel: 'Auth0 डोमेन',
      tenantPlaceholder: 'आपका-टेनेंट (.auth0.com के बिना)',
    },
    keycloak: {
      description: 'स्वयं होस्ट किया गया Keycloak सर्वर',
      tenantLabel: 'सर्वर URL',
      tenantPlaceholder: 'https://keycloak.example.com',
    },
    custom: {
      description: 'कोई भी OpenID Connect प्रदाता',
    },
  },
} satisfies Translation<'setupOidc'>
