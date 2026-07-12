export type AtlasEnvironmentMode = 'live' | 'fixture';

export const appConfig = {
  apiBaseUrl: import.meta.env.VITE_ATLAS_API_BASE_URL ?? '/atlas-api',
  requestTimeoutMs: Number.parseInt(import.meta.env.VITE_ATLAS_REQUEST_TIMEOUT_MS ?? '8000', 10),
  staleAfterMinutes: Number.parseInt(import.meta.env.VITE_ATLAS_STALE_AFTER_MINUTES ?? '20', 10),
  fixtureModeEnabled: String(import.meta.env.VITE_ATLAS_ENABLE_FIXTURES ?? 'false').toLowerCase() === 'true',
  defaultRole: (import.meta.env.VITE_ATLAS_DASHBOARD_ROLE ?? 'CEO').toUpperCase(),
  customerSessionHeaderTransportEnabled: String(import.meta.env.VITE_ATLAS_CUSTOMER_HEADER_SESSION_TRANSPORT ?? 'false').toLowerCase() === 'true',
  customerCsrfCookieName: import.meta.env.VITE_ATLAS_CUSTOMER_CSRF_COOKIE_NAME ?? 'atlas_customer_csrf',
  customerCsrfHeaderName: (import.meta.env.VITE_ATLAS_CUSTOMER_CSRF_HEADER_NAME ?? 'x-atlas-csrf-token').toLowerCase(),
};

export const navigationItems = [
  { key: 'overview', label: 'Executive Overview', path: '/' },
  { key: 'decisions', label: 'CEO Decisions', path: '/decisions' },
  { key: 'missions', label: 'Mission Control', path: '/missions' },
  { key: 'customers', label: 'Customers', path: '/customers' },
  { key: 'opportunities', label: 'Opportunities', path: '/opportunities' },
  { key: 'workforce', label: 'Workforce', path: '/workforce' },
  { key: 'providers', label: 'Providers', path: '/providers' },
  { key: 'system-health', label: 'System Health', path: '/system-health' },
  { key: 'activity', label: 'Activity', path: '/activity' },
  { key: 'studio-home', label: 'Studio Home', path: '/studio' },
  { key: 'studio-services', label: 'Studio Services', path: '/studio/services' },
  { key: 'studio-portfolio', label: 'Studio Portfolio', path: '/studio/portfolio' },
  { key: 'studio-pricing', label: 'Studio Pricing', path: '/studio/pricing' },
  { key: 'studio-process', label: 'Studio Process', path: '/studio/process' },
  { key: 'studio-faq', label: 'Studio FAQ', path: '/studio/faq' },
  { key: 'studio-contact', label: 'Studio Contact', path: '/studio/contact' },
  { key: 'customer-login', label: 'Customer Login', path: '/portal/login' },
  { key: 'customer-projects', label: 'Customer Projects', path: '/portal/projects' },
  { key: 'customer-new-request', label: 'New Website Request', path: '/portal/new-request' },
  { key: 'settings', label: 'Settings', path: '/settings' },
] as const;
