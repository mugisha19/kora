import { Environment } from './environment.model';

export const environment: Environment = {
  production: false,
  apiBaseUrl: '/api/v1',
  useMocks: true,
  // The mock API's fictional demo organizations (src/app/mocks/data.ts). The real API gets its demo
  // seed in API Phase 9; the development environment adds these then.
  demoLogins: {
    password: 'KoraDemo!2026',
    accounts: [
      { email: 'admin@kora.demo', role: 'ORG_ADMIN' },
      { email: 'pmo@kora.demo', role: 'PMO' },
      { email: 'pm@kora.demo', role: 'PROJECT_MANAGER' },
      { email: 'member@kora.demo', role: 'MEMBER' },
      { email: 'viewer@kora.demo', role: 'VIEWER' },
    ],
  },
  contractVersion: '0.8.0',
  appVersion: '1.0.0',
};
