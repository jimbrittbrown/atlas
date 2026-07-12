import { timingSafeEqual } from 'node:crypto';
import {
  ApiErrorCodes,
  ApiRoles,
  ExecutiveDashboardApiVersion,
  ExecutiveDashboardVersion,
  PaginationDefaults,
  parsePageAndSize,
  SupportedFilters,
  SortingDefaults,
  validateFilters
} from './executive-dashboard-api-contracts.js';
import { createEnvelope, createErrorPayload, createRequestId } from './executive-dashboard-api-response.js';
import { ExecutiveDashboardApiAuth } from './executive-dashboard-api-auth.js';
import { ExecutiveDashboardApiAuthorizer } from './executive-dashboard-api-authorizer.js';
import { ExecutiveDashboardApiRateLimiter } from './executive-dashboard-api-rate-limiter.js';
import { ExecutiveDashboardApiAuditLog } from './executive-dashboard-api-audit-log.js';
import { ExecutiveDashboardApiSnapshotRetention } from './executive-dashboard-api-snapshot-retention.js';
import { ExecutiveDashboardApiRouter } from './executive-dashboard-api-router.js';
import { ExecutiveDashboardApiHealth } from './executive-dashboard-api-health.js';
import { DataAvailabilityStatuses } from './executive-operations-dashboard-contracts.js';
import { CeoDecisionCenterApi } from './ceo-decision-center-api.js';
import { CeoDecisionCenterManager } from './ceo-decision-center-manager.js';
import { ExecutiveMissionOrchestratorApi } from './executive-mission-orchestrator-api.js';
import { ExecutiveMissionControlApi } from './executive-mission-control-api.js';
import { ExecutiveOperationsLoopApi } from './executive-operations-loop-api.js';
import { WebsiteProductionManagerApi } from './website-production-manager-api.js';
import { CustomerPortalApi } from './customer-portal-api.js';

function stableSort(records = [], field, direction = 'asc') {
  const dir = String(direction).toLowerCase() === 'desc' ? -1 : 1;
  return records
    .map((record, index) => ({ record, index }))
    .sort((a, b) => {
      const left = a.record?.[field];
      const right = b.record?.[field];

      if (left == null && right == null) return a.index - b.index;
      if (left == null) return 1;
      if (right == null) return -1;

      const cmp = String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
      if (cmp === 0) return a.index - b.index;
      return cmp * dir;
    })
    .map((item) => item.record);
}

function applyPagination(records = [], query = {}) {
  const { page, pageSize, maxPageSizeEnforced } = parsePageAndSize(query, PaginationDefaults.maxPageSize);
  const total = records.length;
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;

  return {
    records: records.slice(start, start + pageSize),
    pagination: {
      page: currentPage,
      pageSize,
      total,
      totalPages,
      maxPageSizeEnforced
    }
  };
}

function safePathReference(pathValue) {
  if (!pathValue) return null;
  const text = String(pathValue);
  const parts = text.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  if (parts[0] === 'review') return `${parts[0]}/${parts[parts.length - 1]}`;
  if (parts.includes('review')) {
    const idx = parts.indexOf('review');
    return `review/${parts[parts.length - 1]}`;
  }
  return parts[parts.length - 1];
}

function redactForRole(data, role) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const clone = JSON.parse(JSON.stringify(data));

  if (role === ApiRoles.AUDITOR) {
    if (clone.customerPipeline?.customerActivityFeed) {
      clone.customerPipeline.customerActivityFeed = clone.customerPipeline.customerActivityFeed.map((item) => ({
        timestamp: item.timestamp,
        type: item.type,
        details: {
          customerId: item.details?.customerId ?? null,
          missionId: item.details?.missionId ?? null
        }
      }));
    }

    if (clone.ceoDecisionCenter?.items) {
      clone.ceoDecisionCenter.items = clone.ceoDecisionCenter.items.map((item) => ({
        ...item,
        relatedCustomer: item.relatedCustomer ? 'REDACTED_CUSTOMER_REF' : null,
        sourceReportPath: safePathReference(item.sourceReportPath)
      }));
    }
  }

  if (clone.ceoDecisionCenter?.items) {
    clone.ceoDecisionCenter.items = clone.ceoDecisionCenter.items.map((item) => ({
      ...item,
      sourceReportPath: safePathReference(item.sourceReportPath)
    }));
  }

  return clone;
}

function parseBooleanLike(value) {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return null;
}

function parseCookieHeader(value) {
  const map = new Map();
  const raw = String(value ?? '').trim();
  if (!raw) return map;

  raw.split(';').forEach((part) => {
    const text = part.trim();
    if (!text) return;
    const index = text.indexOf('=');
    if (index <= 0) return;
    const key = text.slice(0, index).trim();
    const val = text.slice(index + 1).trim();
    if (!key) return;
    map.set(key, decodeURIComponent(val));
  });

  return map;
}

function normalizeSameSite(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'strict') return 'Strict';
  if (normalized === 'lax') return 'Lax';
  if (normalized === 'none') return 'None';
  return null;
}

function resolveCustomerAuthTransport({ env = process.env } = {}) {
  const isProduction = String(env.NODE_ENV ?? '').toLowerCase() === 'production';
  const configuredMode = String(env.ATLAS_CUSTOMER_AUTH_TRANSPORT_MODE ?? 'secure_cookie').trim().toLowerCase();
  const mode = configuredMode === 'development_token' ? 'development_token' : 'secure_cookie';
  const allowDevelopmentTokenTransport = String(env.ATLAS_CUSTOMER_AUTH_ALLOW_DEVELOPMENT_TOKEN_TRANSPORT ?? 'false').toLowerCase() === 'true';
  const secureCookie = String(env.ATLAS_CUSTOMER_SESSION_COOKIE_SECURE ?? 'true').toLowerCase() === 'true';
  const httpOnlyCookie = String(env.ATLAS_CUSTOMER_SESSION_COOKIE_HTTP_ONLY ?? 'true').toLowerCase() === 'true';
  const sameSite = normalizeSameSite(env.ATLAS_CUSTOMER_SESSION_COOKIE_SAMESITE ?? 'Lax');
  const path = String(env.ATLAS_CUSTOMER_SESSION_COOKIE_PATH ?? '/api/v1/customer').trim();
  const name = String(env.ATLAS_CUSTOMER_SESSION_COOKIE_NAME ?? 'atlas_customer_session').trim();
  const domainRaw = String(env.ATLAS_CUSTOMER_SESSION_COOKIE_DOMAIN ?? '').trim();
  const domain = domainRaw.length > 0 ? domainRaw : null;

  const issues = [];

  if (mode === 'development_token') {
    if (!allowDevelopmentTokenTransport) {
      issues.push('Development token transport is disabled. Set ATLAS_CUSTOMER_AUTH_ALLOW_DEVELOPMENT_TOKEN_TRANSPORT=true only for non-production development/testing.');
    }
    if (isProduction) {
      issues.push('Development token transport is not permitted in production.');
    }
  }

  if (mode === 'secure_cookie') {
    if (!name) issues.push('ATLAS_CUSTOMER_SESSION_COOKIE_NAME is required in secure cookie mode.');
    if (!path || !path.startsWith('/')) issues.push('ATLAS_CUSTOMER_SESSION_COOKIE_PATH must be an absolute cookie path.');
    if (!sameSite) issues.push('ATLAS_CUSTOMER_SESSION_COOKIE_SAMESITE must be Strict, Lax, or None.');
    if (!httpOnlyCookie) issues.push('ATLAS_CUSTOMER_SESSION_COOKIE_HTTP_ONLY must remain true in secure cookie mode.');
    if (!secureCookie) issues.push('ATLAS_CUSTOMER_SESSION_COOKIE_SECURE must remain true in secure cookie mode.');
  }

  return {
    mode,
    isProduction,
    allowDevelopmentTokenTransport,
    valid: issues.length === 0,
    issues,
    cookie: {
      name,
      path,
      domain,
      sameSite,
      secure: secureCookie,
      httpOnly: httpOnlyCookie
    }
  };
}

function extractCustomerSessionTokenFromHeaders(headers = {}) {
  const directToken = headers['x-customer-session-token']
    ?? headers['X-Customer-Session-Token']
    ?? headers['x-atlas-customer-session-token']
    ?? null;

  if (typeof directToken === 'string' && directToken.trim().length > 0) {
    return directToken.trim();
  }

  const authHeader = headers.authorization ?? headers.Authorization ?? '';
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token.startsWith('csn_') && token.includes('.')) {
      return token;
    }
  }

  return null;
}

function extractCustomerSessionToken({ headers = {}, transport } = {}) {
  if (transport?.mode === 'secure_cookie') {
    const cookies = parseCookieHeader(headers.cookie ?? headers.Cookie ?? '');
    const cookieToken = cookies.get(transport.cookie.name) ?? null;
    if (typeof cookieToken === 'string' && cookieToken.trim().length > 0) {
      return cookieToken.trim();
    }

    if (transport.allowDevelopmentTokenTransport && !transport.isProduction) {
      return extractCustomerSessionTokenFromHeaders(headers);
    }

    return null;
  }

  return extractCustomerSessionTokenFromHeaders(headers);
}

function buildSessionCookieHeader({ transport, sessionToken, expiresAt } = {}) {
  if (!sessionToken || transport?.mode !== 'secure_cookie') return null;

  const parts = [
    `${transport.cookie.name}=${encodeURIComponent(sessionToken)}`,
    `Path=${transport.cookie.path}`,
    `SameSite=${transport.cookie.sameSite}`,
    `Expires=${new Date(expiresAt).toUTCString()}`
  ];

  if (transport.cookie.httpOnly) parts.push('HttpOnly');
  if (transport.cookie.secure) parts.push('Secure');
  if (transport.cookie.domain) parts.push(`Domain=${transport.cookie.domain}`);

  return parts.join('; ');
}

function buildClearedSessionCookieHeader({ transport } = {}) {
  if (transport?.mode !== 'secure_cookie') return null;

  const parts = [
    `${transport.cookie.name}=`,
    `Path=${transport.cookie.path}`,
    `SameSite=${transport.cookie.sameSite}`,
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'Max-Age=0'
  ];

  if (transport.cookie.httpOnly) parts.push('HttpOnly');
  if (transport.cookie.secure) parts.push('Secure');
  if (transport.cookie.domain) parts.push(`Domain=${transport.cookie.domain}`);

  return parts.join('; ');
}

function secureCompareText(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue ?? ''), 'utf8');
  const right = Buffer.from(String(rightValue ?? ''), 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function normalizeTrustedOrigins(value) {
  const input = String(value ?? '');
  const entries = input
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const normalized = [];
  const issues = [];

  entries.forEach((entry) => {
    if (entry === '*') {
      issues.push('Wildcard trusted origin is not allowed when credentialed cookies are enabled.');
      return;
    }

    let parsed;
    try {
      parsed = new URL(entry);
    } catch {
      issues.push(`Trusted origin is malformed: ${entry}`);
      return;
    }

    if (parsed.origin !== entry) {
      issues.push(`Trusted origin must be exact origin without path/query: ${entry}`);
      return;
    }

    if (!['https:', 'http:'].includes(parsed.protocol)) {
      issues.push(`Trusted origin must use http or https: ${entry}`);
      return;
    }

    if (!normalized.includes(parsed.origin)) {
      normalized.push(parsed.origin);
    }
  });

  return { origins: normalized, issues };
}

function resolveCustomerOriginPolicy({ env = process.env, transport } = {}) {
  const isProduction = String(env.NODE_ENV ?? '').toLowerCase() === 'production';
  const enforceByDefault = transport?.mode === 'secure_cookie';
  const enforceTrustedOrigin = String(env.ATLAS_CUSTOMER_ENFORCE_TRUSTED_ORIGIN ?? String(enforceByDefault)).toLowerCase() === 'true';
  const allowMissingOrigin = String(env.ATLAS_CUSTOMER_ALLOW_MISSING_ORIGIN ?? 'false').toLowerCase() === 'true';
  const parsed = normalizeTrustedOrigins(env.ATLAS_CUSTOMER_TRUSTED_ORIGINS ?? '');
  const trustedOrigins = new Set(parsed.origins);

  const issues = [...parsed.issues];
  if (enforceTrustedOrigin && transport?.mode === 'secure_cookie' && trustedOrigins.size === 0) {
    issues.push('ATLAS_CUSTOMER_TRUSTED_ORIGINS must include at least one exact origin in secure cookie mode.');
  }
  if (isProduction && allowMissingOrigin) {
    issues.push('Missing Origin cannot be allowed in production for protected customer mutations.');
  }

  return {
    enforceTrustedOrigin,
    allowMissingOrigin,
    trustedOrigins,
    valid: issues.length === 0,
    issues
  };
}

function resolveCustomerCsrfPolicy({ env = process.env, transport } = {}) {
  const isProduction = String(env.NODE_ENV ?? '').toLowerCase() === 'production';
  const enabledByDefault = transport?.mode === 'secure_cookie';
  const enabled = String(env.ATLAS_CUSTOMER_CSRF_PROTECTION_ENABLED ?? String(enabledByDefault)).toLowerCase() === 'true';
  const name = String(env.ATLAS_CUSTOMER_CSRF_COOKIE_NAME ?? 'atlas_customer_csrf').trim();
  const headerName = String(env.ATLAS_CUSTOMER_CSRF_HEADER_NAME ?? 'x-atlas-csrf-token').trim();
  const sameSite = normalizeSameSite(env.ATLAS_CUSTOMER_CSRF_COOKIE_SAMESITE ?? 'Lax');
  const secure = String(env.ATLAS_CUSTOMER_CSRF_COOKIE_SECURE ?? 'true').toLowerCase() === 'true';
  const path = String(env.ATLAS_CUSTOMER_CSRF_COOKIE_PATH ?? '/api/v1/customer').trim();
  const domainRaw = String(env.ATLAS_CUSTOMER_CSRF_COOKIE_DOMAIN ?? '').trim();
  const domain = domainRaw.length > 0 ? domainRaw : null;

  const issues = [];
  if (!name) issues.push('ATLAS_CUSTOMER_CSRF_COOKIE_NAME is required when CSRF protection is enabled.');
  if (!headerName) issues.push('ATLAS_CUSTOMER_CSRF_HEADER_NAME is required when CSRF protection is enabled.');
  if (!sameSite) issues.push('ATLAS_CUSTOMER_CSRF_COOKIE_SAMESITE must be Strict, Lax, or None.');
  if (!path || !path.startsWith('/')) issues.push('ATLAS_CUSTOMER_CSRF_COOKIE_PATH must be an absolute path.');
  if (enabled && !secure) issues.push('ATLAS_CUSTOMER_CSRF_COOKIE_SECURE must remain true when CSRF protection is enabled.');
  if (isProduction && !enabled) issues.push('ATLAS_CUSTOMER_CSRF_PROTECTION_ENABLED cannot be false in production secure cookie mode.');

  return {
    enabled,
    valid: issues.length === 0,
    issues,
    cookie: {
      name,
      path,
      domain,
      sameSite,
      secure,
      httpOnly: false
    },
    headerName
  };
}

function resolveRequestOrigin(headers = {}) {
  const proto = String(headers['x-forwarded-proto'] ?? headers['X-Forwarded-Proto'] ?? '').split(',')[0].trim();
  const host = String(headers['x-forwarded-host'] ?? headers['X-Forwarded-Host'] ?? headers.host ?? headers.Host ?? '').split(',')[0].trim();
  if (!proto || !host) return null;
  return `${proto}://${host}`;
}

function parseAndNormalizeOrigin(originValue) {
  const text = String(originValue ?? '').trim();
  if (!text) return { present: false, malformed: false, origin: null };

  try {
    const parsed = new URL(text);
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      return { present: true, malformed: true, origin: null };
    }
    if (parsed.origin !== text) {
      return { present: true, malformed: true, origin: null };
    }
    return { present: true, malformed: false, origin: parsed.origin };
  } catch {
    return { present: true, malformed: true, origin: null };
  }
}

function isCsrfTokenFormatValid(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

const CustomerRouteSecurityClasses = Object.freeze({
  PUBLIC_AUTH_START: 'public_auth_start',
  PUBLIC_AUTH_CALLBACK: 'public_auth_callback',
  PUBLIC_AUTH_ACTION: 'public_auth_action',
  PROTECTED_CUSTOMER_READ: 'protected_customer_read',
  PROTECTED_CUSTOMER_ACTION: 'protected_customer_action'
});

const CustomerRouteSecurityConfig = Object.freeze({
  'POST:/api/v1/customer/register': CustomerRouteSecurityClasses.PUBLIC_AUTH_START,
  'POST:/api/v1/customer/login': CustomerRouteSecurityClasses.PUBLIC_AUTH_START,
  'POST:/api/v1/customer/auth/oidc/start': CustomerRouteSecurityClasses.PUBLIC_AUTH_START,
  'GET:/api/v1/customer/auth/oidc/callback': CustomerRouteSecurityClasses.PUBLIC_AUTH_CALLBACK,
  'POST:/api/v1/customer/password-reset/request': CustomerRouteSecurityClasses.PUBLIC_AUTH_ACTION,
  'POST:/api/v1/customer/password-reset/complete': CustomerRouteSecurityClasses.PUBLIC_AUTH_ACTION
});

function resolveCustomerRouteSecurityClass({ routePath, method }) {
  const upperMethod = String(method ?? '').toUpperCase();
  const key = `${upperMethod}:${routePath}`;
  if (Object.prototype.hasOwnProperty.call(CustomerRouteSecurityConfig, key)) {
    return CustomerRouteSecurityConfig[key];
  }

  const isSafeRead = ['GET', 'HEAD', 'OPTIONS'].includes(upperMethod);
  return isSafeRead
    ? CustomerRouteSecurityClasses.PROTECTED_CUSTOMER_READ
    : CustomerRouteSecurityClasses.PROTECTED_CUSTOMER_ACTION;
}

function isPublicCustomerSecurityClass(securityClass) {
  return securityClass === CustomerRouteSecurityClasses.PUBLIC_AUTH_START
    || securityClass === CustomerRouteSecurityClasses.PUBLIC_AUTH_CALLBACK
    || securityClass === CustomerRouteSecurityClasses.PUBLIC_AUTH_ACTION;
}

function customerRouteSecurityPolicy({ routePath, method }) {
  const upperMethod = String(method ?? '').toUpperCase();
  const isCustomerRoute = String(routePath ?? '').startsWith('/api/v1/customer');
  const isSafeRead = ['GET', 'HEAD', 'OPTIONS'].includes(upperMethod);
  const isMutating = !isSafeRead;

  if (!isCustomerRoute) {
    return {
      isCustomerRoute: false,
      isMutating: false,
      requiresCustomerAuthentication: false,
      requiresOriginValidation: false,
      requiresCsrfValidation: false,
      exemptCategory: String(routePath ?? '').startsWith('/api/v1/payments/webhook') ? 'WEBHOOK' : null
    };
  }
  const securityClass = resolveCustomerRouteSecurityClass({ routePath, method });
  const isPublicRoute = isPublicCustomerSecurityClass(securityClass);

  return {
    isCustomerRoute,
    securityClass,
    isMutating,
    requiresCustomerAuthentication: isCustomerRoute && !isPublicRoute,
    requiresOriginValidation: isCustomerRoute && isMutating,
    requiresCsrfValidation: isCustomerRoute && isMutating && !isPublicRoute,
    exemptCategory: null
  };
}

function buildCsrfCookieHeader({ csrfPolicy, csrfToken, expiresAt } = {}) {
  if (!csrfToken || !csrfPolicy?.enabled) return null;

  const parts = [
    `${csrfPolicy.cookie.name}=${encodeURIComponent(csrfToken)}`,
    `Path=${csrfPolicy.cookie.path}`,
    `SameSite=${csrfPolicy.cookie.sameSite}`,
    `Expires=${new Date(expiresAt).toUTCString()}`
  ];

  if (csrfPolicy.cookie.secure) parts.push('Secure');
  if (csrfPolicy.cookie.domain) parts.push(`Domain=${csrfPolicy.cookie.domain}`);

  return parts.join('; ');
}

function buildClearedCsrfCookieHeader({ csrfPolicy } = {}) {
  if (!csrfPolicy?.enabled) return null;

  const parts = [
    `${csrfPolicy.cookie.name}=`,
    `Path=${csrfPolicy.cookie.path}`,
    `SameSite=${csrfPolicy.cookie.sameSite}`,
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'Max-Age=0'
  ];

  if (csrfPolicy.cookie.secure) parts.push('Secure');
  if (csrfPolicy.cookie.domain) parts.push(`Domain=${csrfPolicy.cookie.domain}`);

  return parts.join('; ');
}

function appendSetCookieHeaders(existingHeaders = null, ...cookieValues) {
  const values = cookieValues.filter((value) => typeof value === 'string' && value.length > 0);
  if (values.length === 0) return existingHeaders;

  const base = existingHeaders ? { ...existingHeaders } : {};
  const current = base['set-cookie'];
  const currentArray = Array.isArray(current)
    ? current.filter(Boolean)
    : (typeof current === 'string' && current.length > 0 ? [current] : []);

  base['set-cookie'] = [...currentArray, ...values];
  return base;
}

function appendUrlParams(urlText, params = {}) {
  const [base, fragment = ''] = String(urlText ?? '').split('#', 2);
  const queryIndex = base.indexOf('?');
  const rawBase = queryIndex >= 0 ? base.slice(0, queryIndex) : base;
  const search = new URLSearchParams(queryIndex >= 0 ? base.slice(queryIndex + 1) : '');

  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value == null || String(value).trim().length === 0) return;
    search.set(String(key), String(value));
  });

  const query = search.toString();
  const withQuery = query ? `${rawBase}?${query}` : rawBase;
  return fragment ? `${withQuery}#${fragment}` : withQuery;
}

function parsePortalRedirectAllowlist(value) {
  const routes = String(value ?? '/customer/portal,/customer/portal/')
    .split(',')
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .filter((item) => item.startsWith('/'));
  return routes.length > 0 ? routes : ['/customer/portal', '/customer/portal/'];
}

function hasPathTraversal(pathname) {
  const text = String(pathname ?? '');
  return text.includes('..') || text.includes('\\') || text.includes('/./') || text.endsWith('/.') || text.endsWith('/..');
}

function decodeRedirectInput(value) {
  const raw = String(value ?? '').trim().normalize('NFKC');
  if (!raw) return { ok: false, value: null };
  if (/\s/.test(raw[0] ?? '')) return { ok: false, value: null };
  if (/%25/i.test(raw)) {
    return { ok: false, value: null };
  }

  let decoded = raw;
  if (raw.includes('%')) {
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      return { ok: false, value: null };
    }
    if (decoded.includes('%')) {
      return { ok: false, value: null };
    }
  }

  return { ok: true, value: decoded };
}

function isDisallowedScheme(value) {
  const text = String(value ?? '').trim().toLowerCase();
  return text.startsWith('javascript:')
    || text.startsWith('data:')
    || text.startsWith('file:')
    || text.startsWith('vbscript:');
}

function containsNestedRedirect(urlObj) {
  const suspiciousKeys = new Set(['redirect', 'redirect_url', 'return', 'return_to', 'next', 'url', 'target', 'destination', 'continue']);
  for (const [key, value] of urlObj.searchParams.entries()) {
    const normalizedKey = String(key ?? '').trim().toLowerCase();
    if (!suspiciousKeys.has(normalizedKey)) continue;
    const decoded = decodeRedirectInput(value);
    if (!decoded.ok) return true;
    const nested = String(decoded.value ?? '').trim();
    if (!nested) continue;
    if (nested.startsWith('//') || isDisallowedScheme(nested)) return true;
    try {
      const parsed = new URL(nested);
      if (['http:', 'https:', 'javascript:', 'data:', 'file:'].includes(parsed.protocol)) {
        return true;
      }
    } catch {
      // Relative nested paths are tolerated only if non-traversal.
      if (hasPathTraversal(nested)) return true;
    }
  }
  return false;
}

function pathAllowed(pathname, allowlist = []) {
  const normalized = String(pathname ?? '').trim();
  return allowlist.some((prefix) => {
    const candidate = String(prefix ?? '').trim();
    if (!candidate) return false;
    if (normalized === candidate) return true;
    return normalized.startsWith(candidate.endsWith('/') ? candidate : `${candidate}/`);
  });
}

function sanitizePortalRedirectTarget({
  env = process.env,
  candidate,
  fallback,
  success,
  errorCode,
  requestId
} = {}) {
  const defaultBase = success
    ? (env.ATLAS_CUSTOMER_PORTAL_AUTH_SUCCESS_URL ?? '/customer/portal')
    : (env.ATLAS_CUSTOMER_PORTAL_AUTH_ERROR_URL ?? '/customer/portal/login');
  const fallbackTarget = String(fallback ?? defaultBase).trim() || defaultBase;
  const allowlist = parsePortalRedirectAllowlist(env.ATLAS_CUSTOMER_PORTAL_REDIRECT_RELATIVE_ALLOWLIST);
  const trusted = normalizeTrustedOrigins(env.ATLAS_CUSTOMER_TRUSTED_ORIGINS ?? '').origins;
  const portalOrigins = normalizeTrustedOrigins(env.ATLAS_CUSTOMER_PORTAL_REDIRECT_ORIGINS ?? '').origins;
  const allowedOrigins = new Set([...trusted, ...portalOrigins]);

  const append = (value) => appendUrlParams(value, success
    ? { auth: 'ok', requestId }
    : { auth: 'error', code: errorCode ?? 'AUTH_FAILED', requestId });

  const normalized = decodeRedirectInput(candidate);
  if (!normalized.ok || !normalized.value) {
    return append(fallbackTarget);
  }

  const target = String(normalized.value).trim();
  if (!target || isDisallowedScheme(target) || target.startsWith('//')) {
    return append(fallbackTarget);
  }

  try {
    const parsed = new URL(target);
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      return append(fallbackTarget);
    }
    if (!allowedOrigins.has(parsed.origin)) {
      return append(fallbackTarget);
    }
    if (hasPathTraversal(parsed.pathname) || !pathAllowed(parsed.pathname, allowlist) || containsNestedRedirect(parsed)) {
      return append(fallbackTarget);
    }
    return append(parsed.toString());
  } catch {
    if (!target.startsWith('/')) {
      return append(fallbackTarget);
    }

    try {
      const parsedRelative = new URL(target, 'https://atlas.local');
      if (hasPathTraversal(parsedRelative.pathname) || !pathAllowed(parsedRelative.pathname, allowlist) || containsNestedRedirect(parsedRelative)) {
        return append(fallbackTarget);
      }
      return append(`${parsedRelative.pathname}${parsedRelative.search}${parsedRelative.hash}`);
    } catch {
      return append(fallbackTarget);
    }
  }
}

function resolvePortalRedirectTarget({
  env = process.env,
  fallback,
  preferred,
  success,
  errorCode,
  requestId
} = {}) {
  return sanitizePortalRedirectTarget({
    env,
    candidate: preferred,
    fallback,
    success,
    errorCode,
    requestId
  });
}

function resolveCustomerContext({ headers = {}, auth = {} } = {}) {
  const customerId = auth?.customerId
    ?? headers['x-customer-id']
    ?? headers['X-Customer-Id']
    ?? headers['x-atlas-customer-id']
    ?? null;
  const accountId = headers['x-customer-account-id']
    ?? headers['X-Customer-Account-Id']
    ?? null;
  const sessionId = headers['x-customer-session-id']
    ?? headers['X-Customer-Session-Id']
    ?? null;

  return {
    customerId: customerId ? String(customerId).trim() : null,
    accountId: accountId ? String(accountId).trim() : null,
    sessionId: sessionId ? String(sessionId).trim() : null,
    requestedBy: auth?.tokenFingerprint ? `token:${auth.tokenFingerprint}` : 'customer-portal'
  };
}

function isPublicCustomerRoute(routePath, method) {
  return isPublicCustomerSecurityClass(resolveCustomerRouteSecurityClass({ routePath, method }));
}

export class ExecutiveDashboardApiService {
  constructor({
    dashboard,
    missionControlManager = null,
    customerPortalManager = null,
    websiteProductionManager = null,
    auth,
    authorizer,
    rateLimiter,
    auditLog,
    retention,
    router,
    health,
    logger,
    env = process.env
  } = {}) {
    this.logger = logger ?? { log: () => {} };
    this.env = env;
    this.customerAuthTransport = resolveCustomerAuthTransport({ env: this.env });
    this.customerOriginPolicy = resolveCustomerOriginPolicy({ env: this.env, transport: this.customerAuthTransport });
    this.customerCsrfPolicy = resolveCustomerCsrfPolicy({ env: this.env, transport: this.customerAuthTransport });

    this.dashboard = dashboard ?? null;
    this.auth = auth ?? new ExecutiveDashboardApiAuth();
    this.authorizer = authorizer ?? new ExecutiveDashboardApiAuthorizer();
    this.rateLimiter = rateLimiter ?? new ExecutiveDashboardApiRateLimiter();
    this.auditLog = auditLog ?? new ExecutiveDashboardApiAuditLog({
      storageProvider: this.dashboard?.manager?.storageProvider ?? null
    });
    this.router = router ?? new ExecutiveDashboardApiRouter();
    this.health = health ?? new ExecutiveDashboardApiHealth();
    this.retention = retention ?? new ExecutiveDashboardApiSnapshotRetention({ registry: this.dashboard?.manager?.snapshotRegistry ?? null });
    const ceoDecisionCenterManager = this.dashboard
      ? new CeoDecisionCenterManager({ dashboard: this.dashboard })
      : null;
    this.ceoDecisionCenterApi = new CeoDecisionCenterApi({
      manager: ceoDecisionCenterManager
    });
    this.missionOrchestratorApi = new ExecutiveMissionOrchestratorApi({
      manager: this.dashboard?.manager?.missionOrchestratorManager ?? null
    });
    this.missionControlManager = missionControlManager ?? this.dashboard?.manager?.missionControlManager ?? null;
    this.missionControlApi = new ExecutiveMissionControlApi({
      manager: this.missionControlManager
    });
    this.operationsLoopApi = new ExecutiveOperationsLoopApi({
      manager: this.dashboard?.manager?.operationsLoopManager ?? null
    });
    this.websiteProductionApi = new WebsiteProductionManagerApi({
      manager: websiteProductionManager ?? this.dashboard?.manager?.websiteProductionManager ?? null
    });
    this.customerPortalManager = customerPortalManager ?? this.dashboard?.manager?.customerPortalManager ?? null;
    this.customerPortalApi = new CustomerPortalApi({
      manager: this.customerPortalManager
    });

    this.lastDashboardError = null;
  }

  sanitizeCustomerAuthPayload(data) {
    if (!data || typeof data !== 'object') return data;
    if (this.customerAuthTransport.mode !== 'secure_cookie') return data;
    if (!Object.prototype.hasOwnProperty.call(data, 'sessionToken') && !Object.prototype.hasOwnProperty.call(data, 'csrfToken')) {
      return data;
    }

    const clone = { ...data };
    delete clone.sessionToken;
    delete clone.csrfToken;
    return clone;
  }

  recordCustomerSecurityMetric(metricName) {
    this.customerPortalManager?.authManager?.recordSecurityEvent?.(metricName);
  }

  rejectCustomerSecurity({ requestId, routePath, method, clientId, auth = null, code, message, status, details = null, metricName = null }) {
    if (metricName) {
      this.recordCustomerSecurityMetric(metricName);
    }
    this.recordCustomerSecurityMetric('protectedRequestDenied');

    this.auditLog.record({
      requestId,
      role: auth?.role ?? null,
      endpoint: routePath,
      operation: String(method ?? '').toUpperCase() === 'GET' ? 'READ' : 'WRITE',
      success: false,
      responseCategory: code,
      filters: {},
      clientId,
      durationMs: 0,
      deniedReason: code
    });

    return this.normalizeError({
      requestId,
      code,
      message,
      status,
      details
    });
  }

  metadataPayload() {
    return {
      apiVersion: ExecutiveDashboardApiVersion,
      dashboardVersion: ExecutiveDashboardVersion,
      generatedTimestamp: new Date().toISOString(),
      supportedFilters: SupportedFilters,
      supportedRoles: Object.values(ApiRoles),
      dataAvailabilityStatuses: Object.values(DataAvailabilityStatuses),
      knownLimitations: [
        'Read-only API v1 uses in-memory rate limiting and snapshot retention.',
        'Persistent API storage adapters are future work.'
      ]
    };
  }

  ensureServiceDependency({ requestId, dependencyAvailable, message }) {
    if (dependencyAvailable) return null;

    return this.normalizeError({
      requestId,
      code: ApiErrorCodes.DATA_UNAVAILABLE,
      message,
      status: 503
    });
  }

  generateSnapshotSafe() {
    try {
      const snapshot = this.dashboard.generateSnapshot();
      this.retention.enforceOnWrite();
      return { snapshot, error: null };
    } catch (error) {
      this.lastDashboardError = error instanceof Error ? error : new Error(String(error));
      return { snapshot: null, error: this.lastDashboardError };
    }
  }

  normalizeError({ requestId, code, message, status = 400, details = null, warnings = [], responseHeaders = null }) {
    return {
      httpStatus: status,
      ...(responseHeaders ? { responseHeaders } : {}),
      envelope: createEnvelope({
        success: false,
        status,
        requestId,
        data: null,
        pagination: null,
        dataFreshness: null,
        warnings,
        limitations: ['API is read-only and does not execute write-side operations.'],
        error: createErrorPayload({
          code,
          message,
          details
        })
      })
    };
  }

  checkAuthAndRate({ headers = {}, route, requestId, clientId, customerSessionAuth = null, allowPublicCustomer = false }) {
    const rate = this.rateLimiter.check(clientId);
    if (!rate.allowed) {
      return {
        ok: false,
        auth: null,
        error: this.normalizeError({
          requestId,
          code: ApiErrorCodes.RATE_LIMITED,
          message: 'Request rate limit exceeded.',
          status: 429,
          details: { resetAt: new Date(rate.resetAt).toISOString(), limit: rate.limit }
        }),
        rate
      };
    }

    const serviceAuth = this.auth.authenticate({ headers });
    const auth = serviceAuth.authenticated
      ? serviceAuth
      : (customerSessionAuth?.authenticated ? customerSessionAuth : null);

    if (!auth?.authenticated) {
      if (allowPublicCustomer) {
        const publicCustomerAuth = {
          authenticated: true,
          role: ApiRoles.CUSTOMER,
          reason: null,
          tokenFingerprint: 'customer-public'
        };

        const authorization = this.authorizer.authorize({
          role: publicCustomerAuth.role,
          permission: route.permission
        });

        if (authorization.allowed) {
          return {
            ok: true,
            auth: publicCustomerAuth,
            rate,
            error: null
          };
        }
      }

      return {
        ok: false,
        auth: serviceAuth,
        error: this.normalizeError({
          requestId,
          code: ApiErrorCodes.UNAUTHORIZED,
          message: 'Unauthorized request.',
          status: 401
        }),
        rate
      };
    }

    const authorization = this.authorizer.authorize({
      role: auth.role,
      permission: route.permission
    });

    if (!authorization.allowed) {
      return {
        ok: false,
        auth,
        error: this.normalizeError({
          requestId,
          code: ApiErrorCodes.FORBIDDEN,
          message: 'Forbidden request.',
          status: 403
        }),
        rate
      };
    }

    return {
      ok: true,
      auth,
      rate,
      error: null
    };
  }

  authenticateCustomerSessionFromHeaders({ headers = {} } = {}) {
    const sessionToken = extractCustomerSessionToken({ headers, transport: this.customerAuthTransport });
    if (!sessionToken) {
      return {
        authenticated: false,
        reason: 'Missing customer session token.',
        role: null,
        tokenFingerprint: null
      };
    }

    const auth = this.customerPortalApi.authenticateSession({ sessionToken });
    if (!auth.accepted) {
      return {
        authenticated: false,
        reason: auth.reason ?? 'Invalid customer session.',
        role: null,
        tokenFingerprint: null
      };
    }

    return {
      authenticated: true,
      reason: null,
      role: ApiRoles.CUSTOMER,
      tokenFingerprint: `customer-session:${auth.data.session.sessionId}`,
      customerId: auth.data.customer.customerId,
      accountStatus: auth.data.customer.status,
      sessionId: auth.data.session.sessionId,
      customerSession: auth.data.session,
      customerSessionToken: sessionToken
    };
  }

  filterDecisionItems(items = [], query = {}) {
    let filtered = items.slice();

    if (query.decisionType) filtered = filtered.filter((item) => String(item.decisionType).toUpperCase() === String(query.decisionType).toUpperCase());
    if (query.recommendation) filtered = filtered.filter((item) => String(item.recommendation).toUpperCase().includes(String(query.recommendation).toUpperCase()));
    if (query.urgency) filtered = filtered.filter((item) => Number(item.urgency ?? -Infinity) >= Number(query.urgency));
    if (query.risk) filtered = filtered.filter((item) => Number(item.risk ?? -Infinity) >= Number(query.risk));
    if (query.customer) filtered = filtered.filter((item) => String(item.relatedCustomer ?? '').toLowerCase().includes(String(query.customer).toLowerCase()));
    if (query.mission) filtered = filtered.filter((item) => String(item.relatedMission ?? '').toLowerCase().includes(String(query.mission).toLowerCase()));
    if (query.age) filtered = filtered.filter((item) => Number(item.age ?? Infinity) <= Number(query.age));
    if (query.blockingStatus) {
      const desired = parseBooleanLike(query.blockingStatus);
      if (desired !== null) {
        filtered = filtered.filter((item) => ((item.blockingIssues ?? []).length > 0) === desired);
      }
    }

    const sortBy = query.sortBy && ['urgency', 'risk', 'age', 'decisionType'].includes(query.sortBy)
      ? query.sortBy
      : SortingDefaults.decisions.field;
    const sortDirection = query.sortDirection ?? SortingDefaults.decisions.direction;

    return stableSort(filtered, sortBy, sortDirection);
  }

  filterMissionItems(items = [], query = {}) {
    let filtered = items.slice();

    if (query.state) filtered = filtered.filter((item) => String(item.currentState).toUpperCase() === String(query.state).toUpperCase());
    if (query.stage) filtered = filtered.filter((item) => String(item.currentStage).toUpperCase() === String(query.stage).toUpperCase());
    if (query.missionType) filtered = filtered.filter((item) => String(item.missionType).toUpperCase() === String(query.missionType).toUpperCase());
    if (query.customer) filtered = filtered.filter((item) => String(item.customer).toLowerCase().includes(String(query.customer).toLowerCase()));
    if (query.worker) filtered = filtered.filter((item) => (item.assignedWorkers ?? []).some((worker) => String(worker).toUpperCase().includes(String(query.worker).toUpperCase())));
    if (query.priority) filtered = filtered.filter((item) => String(item.priority).toUpperCase() === String(query.priority).toUpperCase());
    if (query.confidence) filtered = filtered.filter((item) => Number(item.confidence ?? -Infinity) >= Number(query.confidence));
    if (query.risk) filtered = filtered.filter((item) => Number(item.risk ?? -Infinity) >= Number(query.risk));
    if (query.ceoReviewStatus) filtered = filtered.filter((item) => String(item.ceoReviewStatus).toUpperCase() === String(query.ceoReviewStatus).toUpperCase());
    if (query.blockedStatus) {
      const desired = parseBooleanLike(query.blockedStatus);
      if (desired !== null) {
        filtered = filtered.filter((item) => ((item.blockingIssues ?? []).length > 0) === desired);
      }
    }

    const sortBy = query.sortBy && ['missionId', 'completionPercentage', 'priority', 'risk', 'confidence'].includes(query.sortBy)
      ? query.sortBy
      : SortingDefaults.missions.field;
    const sortDirection = query.sortDirection ?? SortingDefaults.missions.direction;

    return stableSort(filtered, sortBy, sortDirection);
  }

  filterActivityItems(items = [], query = {}) {
    let filtered = items.slice();

    if (query.severity) filtered = filtered.filter((item) => String(item.severity).toUpperCase() === String(query.severity).toUpperCase());
    if (query.category) filtered = filtered.filter((item) => String(item.category).toUpperCase() === String(query.category).toUpperCase());
    if (query.sourceSystem) filtered = filtered.filter((item) => String(item.sourceSystem).toUpperCase() === String(query.sourceSystem).toUpperCase());
    if (query.customer) filtered = filtered.filter((item) => String(item.customerId ?? '').toLowerCase().includes(String(query.customer).toLowerCase()));
    if (query.mission) filtered = filtered.filter((item) => String(item.missionId ?? '').toLowerCase().includes(String(query.mission).toLowerCase()));
    if (query.worker) filtered = filtered.filter((item) => String(item.workerId ?? '').toLowerCase().includes(String(query.worker).toLowerCase()));

    if (query.startTimestamp) {
      const start = new Date(query.startTimestamp).getTime();
      if (Number.isFinite(start)) {
        filtered = filtered.filter((item) => new Date(item.timestamp).getTime() >= start);
      }
    }

    if (query.endTimestamp) {
      const end = new Date(query.endTimestamp).getTime();
      if (Number.isFinite(end)) {
        filtered = filtered.filter((item) => new Date(item.timestamp).getTime() <= end);
      }
    }

    const sortBy = query.sortBy && ['timestamp', 'severity', 'category'].includes(query.sortBy)
      ? query.sortBy
      : SortingDefaults.activity.field;
    const sortDirection = query.sortDirection ?? SortingDefaults.activity.direction;

    return stableSort(filtered, sortBy, sortDirection);
  }

  filterAlertItems(items = [], query = {}) {
    let filtered = items.slice();

    if (query.severity) filtered = filtered.filter((item) => String(item.severity).toUpperCase() === String(query.severity).toUpperCase());
    if (query.category) filtered = filtered.filter((item) => String(item.category).toUpperCase() === String(query.category).toUpperCase());
    if (query.source) filtered = filtered.filter((item) => String(item.sourceSystem).toUpperCase() === String(query.source).toUpperCase());
    if (query.customer) filtered = filtered.filter((item) => String(item.customerId ?? '').toLowerCase().includes(String(query.customer).toLowerCase()));
    if (query.mission) filtered = filtered.filter((item) => String(item.missionId ?? '').toLowerCase().includes(String(query.mission).toLowerCase()));
    if (query.resolvedStatus) {
      const desired = parseBooleanLike(query.resolvedStatus);
      if (desired !== null) {
        filtered = filtered.filter((item) => Boolean(item.resolved) === desired);
      }
    }

    const sortBy = query.sortBy && ['timestamp', 'severity', 'category'].includes(query.sortBy)
      ? query.sortBy
      : SortingDefaults.alerts.field;
    const sortDirection = query.sortDirection ?? SortingDefaults.alerts.direction;

    return stableSort(filtered, sortBy, sortDirection);
  }

  buildHealthPayload() {
    const lastSnapshot = this.dashboard.getLatestSnapshot?.() ?? null;
    return this.health.project({
      auth: this.auth,
      dashboard: this.dashboard,
      snapshotRegistry: this.dashboard?.manager?.snapshotRegistry ?? null,
      retention: this.retention,
      rateLimiter: this.rateLimiter,
      auditLog: this.auditLog,
      lastSnapshot,
      lastError: this.lastDashboardError
    });
  }

  async handleRequest(request = {}) {
    const startedAt = Date.now();
    const requestId = request.requestId ?? createRequestId();
    const method = String(request.method ?? 'GET').toUpperCase();
    const path = String(request.path ?? '');
    const query = request.query ?? {};
    const body = request.body ?? {};
    const headers = request.headers ?? {};
    const clientId = request.clientId ?? headers['x-client-id'] ?? headers['X-Client-Id'] ?? 'anonymous';

    const resolved = this.router.resolve({ method, path });
    if (!resolved.found) {
      const error = this.normalizeError({
        requestId,
        code: ApiErrorCodes.NOT_FOUND,
        message: 'Route not found.',
        status: 404
      });
      this.auditLog.record({
        requestId,
        role: null,
        endpoint: path,
        operation: 'READ',
        success: false,
        responseCategory: ApiErrorCodes.NOT_FOUND,
        filters: query,
        clientId,
        durationMs: Date.now() - startedAt,
        deniedReason: 'ROUTE_NOT_FOUND'
      });
      return error;
    }

    const missionControlCommandByRoute = {
      '/api/v1/mission-control/:missionId/retry': 'RETRY',
      '/api/v1/mission-control/:missionId/resume': 'RESUME',
      '/api/v1/mission-control/:missionId/rollback': 'ROLLBACK',
      '/api/v1/mission-control/:missionId/cancel': 'CANCEL',
      '/api/v1/mission-control/:missionId/pause': 'PAUSE',
      '/api/v1/mission-control/:missionId/force-executive-review': 'FORCE_EXECUTIVE_REVIEW'
    };

    const routePath = resolved.route.path;
    const routeSecurity = customerRouteSecurityPolicy({ routePath, method });
    const customerRoute = routeSecurity.isCustomerRoute;

    if (customerRoute && !this.customerAuthTransport.valid) {
      return this.rejectCustomerSecurity({
        requestId,
        routePath,
        method,
        clientId,
        code: ApiErrorCodes.DATA_UNAVAILABLE,
        message: 'Customer authentication transport is not configured safely.',
        status: 503,
        details: {
          transportMode: this.customerAuthTransport.mode,
          issues: this.customerAuthTransport.issues
        }
      });
    }

    if (customerRoute && this.customerAuthTransport.mode === 'secure_cookie' && !this.customerOriginPolicy.valid) {
      return this.rejectCustomerSecurity({
        requestId,
        routePath,
        method,
        clientId,
        code: ApiErrorCodes.DATA_UNAVAILABLE,
        message: 'Customer origin policy is not configured safely.',
        status: 503,
        details: {
          issues: this.customerOriginPolicy.issues
        }
      });
    }

    if (customerRoute && this.customerAuthTransport.mode === 'secure_cookie' && this.customerCsrfPolicy.enabled && !this.customerCsrfPolicy.valid) {
      return this.rejectCustomerSecurity({
        requestId,
        routePath,
        method,
        clientId,
        code: ApiErrorCodes.DATA_UNAVAILABLE,
        message: 'Customer CSRF policy is not configured safely.',
        status: 503,
        details: {
          issues: this.customerCsrfPolicy.issues
        }
      });
    }

    if (customerRoute && routeSecurity.requiresOriginValidation && this.customerAuthTransport.mode === 'secure_cookie' && this.customerOriginPolicy.enforceTrustedOrigin) {
      const parsedOrigin = parseAndNormalizeOrigin(headers.origin ?? headers.Origin ?? null);
      if (!parsedOrigin.present) {
        if (!this.customerOriginPolicy.allowMissingOrigin) {
          return this.rejectCustomerSecurity({
            requestId,
            routePath,
            method,
            clientId,
            code: ApiErrorCodes.FORBIDDEN,
            message: 'Missing Origin header for protected customer mutation.',
            status: 403,
            metricName: 'missingOriginRejected'
          });
        }
      } else if (parsedOrigin.malformed) {
        return this.rejectCustomerSecurity({
          requestId,
          routePath,
          method,
          clientId,
          code: ApiErrorCodes.FORBIDDEN,
          message: 'Malformed Origin header.',
          status: 403,
          metricName: 'originRejected'
        });
      } else {
        const requestOrigin = resolveRequestOrigin(headers);
        const isSameOrigin = requestOrigin ? secureCompareText(parsedOrigin.origin, requestOrigin) : false;
        const isTrustedOrigin = this.customerOriginPolicy.trustedOrigins.has(parsedOrigin.origin);
        if (!isSameOrigin && !isTrustedOrigin) {
          return this.rejectCustomerSecurity({
            requestId,
            routePath,
            method,
            clientId,
            code: ApiErrorCodes.FORBIDDEN,
            message: 'Origin is not trusted for customer mutation.',
            status: 403,
            metricName: 'originRejected'
          });
        }

        this.recordCustomerSecurityMetric('originAccepted');
      }
    }

    const customerSessionAuth = customerRoute
      ? this.authenticateCustomerSessionFromHeaders({ headers })
      : null;

    const gate = this.checkAuthAndRate({
      headers,
      route: resolved.route,
      requestId,
      clientId,
      customerSessionAuth,
      allowPublicCustomer: customerRoute && isPublicCustomerRoute(routePath, method)
    });
    if (!gate.ok) {
      if (gate.error?.envelope?.error?.code === ApiErrorCodes.RATE_LIMITED && customerRoute) {
        this.customerPortalManager.recordAuthRateLimitEvent?.();
        if (routePath.startsWith('/api/v1/customer/payments')) {
          this.customerPortalManager.recordPaymentRateLimitEvent?.();
        }
      }

      if (method === 'POST' && missionControlCommandByRoute[resolved.route.path]) {
        this.missionControlManager?.auditLog?.record?.({
          command: missionControlCommandByRoute[resolved.route.path],
          missionId: resolved.params.missionId ?? null,
          requestedBy: gate.auth?.tokenFingerprint ?? 'anonymous',
          role: gate.auth?.role ?? 'UNAUTHENTICATED',
          result: 'REJECTED',
          previousState: null,
          resultingState: null,
          rejectionReason: gate.auth?.reason ?? gate.error.envelope.error.code,
          timestamp: new Date().toISOString(),
          correlationId: requestId
        });
      }

      this.auditLog.record({
        requestId,
        role: gate.auth?.role ?? null,
        endpoint: resolved.route.path,
        operation: 'READ',
        success: false,
        responseCategory: gate.error.envelope.error.code,
        filters: query,
        clientId,
        durationMs: Date.now() - startedAt,
        deniedReason: gate.auth?.reason ?? gate.error.envelope.error.code
      });
      return gate.error;
    }

    if (customerRoute && routeSecurity.requiresCsrfValidation && this.customerAuthTransport.mode === 'secure_cookie' && this.customerCsrfPolicy.enabled) {
      const cookies = parseCookieHeader(headers.cookie ?? headers.Cookie ?? '');
      const csrfCookieToken = cookies.get(this.customerCsrfPolicy.cookie.name) ?? null;
      const csrfHeaderTokenRaw = headers[this.customerCsrfPolicy.headerName]
        ?? headers[this.customerCsrfPolicy.headerName.toLowerCase()]
        ?? headers[this.customerCsrfPolicy.headerName.toUpperCase()]
        ?? null;
      const csrfHeaderToken = typeof csrfHeaderTokenRaw === 'string' ? csrfHeaderTokenRaw.trim() : null;

      if (!csrfHeaderToken) {
        return this.rejectCustomerSecurity({
          requestId,
          routePath,
          method,
          clientId,
          auth: gate.auth,
          code: ApiErrorCodes.FORBIDDEN,
          message: 'Missing CSRF header token for protected customer mutation.',
          status: 403,
          metricName: 'csrfMissing'
        });
      }

      if (!csrfCookieToken) {
        return this.rejectCustomerSecurity({
          requestId,
          routePath,
          method,
          clientId,
          auth: gate.auth,
          code: ApiErrorCodes.FORBIDDEN,
          message: 'Missing CSRF cookie token for protected customer mutation.',
          status: 403,
          metricName: 'csrfMissing'
        });
      }

      if (!isCsrfTokenFormatValid(csrfHeaderToken) || !isCsrfTokenFormatValid(csrfCookieToken)) {
        return this.rejectCustomerSecurity({
          requestId,
          routePath,
          method,
          clientId,
          auth: gate.auth,
          code: ApiErrorCodes.FORBIDDEN,
          message: 'Malformed CSRF token.',
          status: 403,
          metricName: 'csrfMalformed'
        });
      }

      if (!secureCompareText(csrfHeaderToken, csrfCookieToken)) {
        return this.rejectCustomerSecurity({
          requestId,
          routePath,
          method,
          clientId,
          auth: gate.auth,
          code: ApiErrorCodes.FORBIDDEN,
          message: 'CSRF token mismatch.',
          status: 403,
          metricName: 'csrfMismatch'
        });
      }

      const csrfValidation = this.customerPortalManager?.authManager?.sessionManager?.validateCsrfToken?.({
        session: gate.auth?.customerSession ?? null,
        csrfToken: csrfHeaderToken
      }) ?? { valid: false, reason: 'SESSION_MANAGER_UNAVAILABLE' };

      if (!csrfValidation.valid) {
        return this.rejectCustomerSecurity({
          requestId,
          routePath,
          method,
          clientId,
          auth: gate.auth,
          code: ApiErrorCodes.FORBIDDEN,
          message: 'CSRF token is not valid for the active customer session.',
          status: 403,
          metricName: csrfValidation.reason === 'CSRF_MALFORMED' ? 'csrfMalformed' : 'csrfMismatch'
        });
      }

      this.recordCustomerSecurityMetric('csrfValidated');
    }

    try {
      const { snapshot, error } = this.generateSnapshotSafe();
      if (error || !snapshot) {
        const unavailable = this.normalizeError({
          requestId,
          code: ApiErrorCodes.DATA_UNAVAILABLE,
          message: 'Dashboard snapshot is unavailable.',
          status: 503
        });
        this.auditLog.record({
          requestId,
          role: gate.auth.role,
          endpoint: routePath,
          operation: 'READ',
          success: false,
          responseCategory: ApiErrorCodes.DATA_UNAVAILABLE,
          filters: query,
          clientId,
          durationMs: Date.now() - startedAt,
          deniedReason: error?.message ?? 'SNAPSHOT_UNAVAILABLE'
        });
        return unavailable;
      }

      const buildSuccess = ({ data, pagination = null, warnings = [], limitations = [], responseHeaders = null }) => {
        const redacted = redactForRole(data, gate.auth.role);
        const envelope = createEnvelope({
          success: true,
          status: 200,
          requestId,
          data: redacted,
          pagination,
          dataFreshness: snapshot.dataFreshness ?? null,
          warnings,
          limitations
        });

        this.auditLog.record({
          requestId,
          role: gate.auth.role,
          endpoint: routePath,
          operation: 'READ',
          success: true,
          responseCategory: 'OK',
          filters: query,
          clientId,
          durationMs: Date.now() - startedAt,
          warnings
        });

        return {
          httpStatus: 200,
          ...(responseHeaders ? { responseHeaders } : {}),
          envelope
        };
      };

      const buildRedirect = ({ location, responseHeaders = null }) => {
        const headers = {
          ...(responseHeaders ?? {}),
          location
        };

        return {
          httpStatus: 302,
          responseHeaders: headers,
          envelope: createEnvelope({
            success: true,
            status: 302,
            requestId,
            data: { redirected: true, location },
            pagination: null,
            dataFreshness: null,
            warnings: [],
            limitations: []
          })
        };
      };

      if (routePath === '/api/v1/dashboard') {
        return buildSuccess({ data: snapshot, limitations: snapshot.limitations ?? [] });
      }

      if (routePath === '/api/v1/ceo/decision-center') {
        return buildSuccess({ data: this.ceoDecisionCenterApi.buildResponse() });
      }

      if (routePath === '/api/v1/mission-orchestrator') {
        return buildSuccess({ data: this.missionOrchestratorApi.buildResponse() });
      }

      if (routePath === '/api/v1/operations-loop') {
        return buildSuccess({ data: this.operationsLoopApi.buildResponse() });
      }

      if (routePath === '/api/v1/website-production') {
        const dependencyError = this.ensureServiceDependency({
          requestId,
          dependencyAvailable: Boolean(this.websiteProductionApi?.manager),
          message: 'Website production projection provider is not available. Register provider during bootstrap.'
        });
        if (dependencyError) return dependencyError;
        return buildSuccess({ data: this.websiteProductionApi.buildResponse() });
      }

      if (routePath === '/api/v1/mission-control') {
        const dependencyError = this.ensureServiceDependency({
          requestId,
          dependencyAvailable: Boolean(this.missionControlManager),
          message: 'Mission control service is not available. Inject mission control manager during bootstrap.'
        });
        if (dependencyError) return dependencyError;
        return buildSuccess({ data: this.missionControlApi.listMissions() });
      }

      if (routePath.startsWith('/api/v1/customer/') || routePath === '/api/v1/payments/webhook/stripe') {
        const dependencyError = this.ensureServiceDependency({
          requestId,
          dependencyAvailable: Boolean(this.customerPortalManager),
          message: 'Customer portal service is not available. Inject customer portal manager during bootstrap.'
        });
        if (dependencyError) return dependencyError;
      }

      if (routePath === '/api/v1/customer/register' && method === 'POST') {
        const registration = this.customerPortalApi.register({ body });
        if (!registration.accepted) {
          return this.normalizeError({
            requestId,
            code: registration.code === 'PROVIDER_NOT_CONFIGURED' ? ApiErrorCodes.DATA_UNAVAILABLE : ApiErrorCodes.INVALID_REQUEST,
            message: registration.reason,
            status: registration.status
          });
        }

        const setCookie = buildSessionCookieHeader({
          transport: this.customerAuthTransport,
          sessionToken: registration.data?.sessionToken,
          expiresAt: registration.data?.expiresAt
        });
        const csrfCookie = buildCsrfCookieHeader({
          csrfPolicy: this.customerCsrfPolicy,
          csrfToken: registration.data?.csrfToken,
          expiresAt: registration.data?.expiresAt
        });

        return buildSuccess({
          data: this.sanitizeCustomerAuthPayload(registration.data),
          responseHeaders: appendSetCookieHeaders(null, setCookie, csrfCookie)
        });
      }

      if (routePath === '/api/v1/customer/projects') {
        const customerContext = resolveCustomerContext({ headers, auth: gate.auth });
        const projects = this.customerPortalApi.listProjects({ customerId: customerContext.customerId });
        if (!projects.found) {
          return this.normalizeError({
            requestId,
            code: ApiErrorCodes.NOT_FOUND,
            message: projects.reason,
            status: projects.status
          });
        }

        return buildSuccess({ data: projects.data });
      }

      if (routePath === '/api/v1/customer/login' && method === 'POST') {
        const login = this.customerPortalApi.login({ body });
        if (!login.accepted) {
          const codeByLoginCode = {
            UNAUTHORIZED: ApiErrorCodes.UNAUTHORIZED,
            EMAIL_NOT_VERIFIED: ApiErrorCodes.FORBIDDEN,
            PROVIDER_NOT_CONFIGURED: ApiErrorCodes.DATA_UNAVAILABLE,
            NOT_FOUND: ApiErrorCodes.NOT_FOUND
          };
          return this.normalizeError({
            requestId,
            code: codeByLoginCode[login.code] ?? ApiErrorCodes.INVALID_REQUEST,
            message: login.reason,
            status: login.status
          });
        }

        const setCookie = buildSessionCookieHeader({
          transport: this.customerAuthTransport,
          sessionToken: login.data?.sessionToken,
          expiresAt: login.data?.expiresAt
        });
        const csrfCookie = buildCsrfCookieHeader({
          csrfPolicy: this.customerCsrfPolicy,
          csrfToken: login.data?.csrfToken,
          expiresAt: login.data?.expiresAt
        });

        return buildSuccess({
          data: this.sanitizeCustomerAuthPayload(login.data),
          responseHeaders: appendSetCookieHeaders(null, setCookie, csrfCookie)
        });
      }

      if (routePath === '/api/v1/customer/auth/oidc/start' && method === 'POST') {
        const started = await this.customerPortalApi.startOidcAuthorization({ body });
        if (!started.accepted) {
          const codeByStartCode = {
            PROVIDER_NOT_CONFIGURED: ApiErrorCodes.DATA_UNAVAILABLE,
            PROVIDER_UNAVAILABLE: ApiErrorCodes.DATA_UNAVAILABLE,
            PROVIDER_MISMATCH: ApiErrorCodes.FORBIDDEN,
            CONFLICT: ApiErrorCodes.CONFLICT
          };
          return this.normalizeError({
            requestId,
            code: codeByStartCode[started.code] ?? ApiErrorCodes.INVALID_REQUEST,
            message: started.reason,
            status: started.status
          });
        }

        return buildSuccess({ data: started.data });
      }

      if (routePath === '/api/v1/customer/auth/oidc/callback' && method === 'GET') {
        const callback = await this.customerPortalApi.completeOidcAuthorizationCallback({ query });
        if (!callback.accepted) {
          const failureLocation = resolvePortalRedirectTarget({
            env: this.env,
            preferred: callback.data?.portalRedirectUri ?? query.return_to ?? null,
            fallback: this.env.ATLAS_CUSTOMER_PORTAL_AUTH_ERROR_URL ?? '/customer/portal/login',
            success: false,
            errorCode: callback.code,
            requestId
          });
          return buildRedirect({ location: failureLocation });
        }

        const setCookie = buildSessionCookieHeader({
          transport: this.customerAuthTransport,
          sessionToken: callback.data?.sessionToken,
          expiresAt: callback.data?.expiresAt
        });
        const csrfCookie = buildCsrfCookieHeader({
          csrfPolicy: this.customerCsrfPolicy,
          csrfToken: callback.data?.csrfToken,
          expiresAt: callback.data?.expiresAt
        });
        const successLocation = resolvePortalRedirectTarget({
          env: this.env,
          preferred: callback.data?.portalRedirectUri ?? query.return_to ?? null,
          fallback: this.env.ATLAS_CUSTOMER_PORTAL_AUTH_SUCCESS_URL ?? '/customer/portal',
          success: true,
          requestId
        });

        return buildRedirect({
          location: successLocation,
          responseHeaders: appendSetCookieHeaders(null, setCookie, csrfCookie)
        });
      }

      if (routePath === '/api/v1/customer/logout' && method === 'POST') {
        const logout = await this.customerPortalApi.logout({
          sessionToken: gate.auth.customerSessionToken ?? extractCustomerSessionToken({ headers, transport: this.customerAuthTransport })
        });
        if (!logout.accepted) {
          return this.normalizeError({
            requestId,
            code: ApiErrorCodes.UNAUTHORIZED,
            message: logout.reason,
            status: logout.status
          });
        }

        const clearCookie = buildClearedSessionCookieHeader({ transport: this.customerAuthTransport });
        const clearCsrfCookie = buildClearedCsrfCookieHeader({ csrfPolicy: this.customerCsrfPolicy });
        return buildSuccess({
          data: logout.data,
          responseHeaders: appendSetCookieHeaders(null, clearCookie, clearCsrfCookie)
        });
      }

      if (routePath === '/api/v1/customer/session/refresh' && method === 'POST') {
        const refreshed = await this.customerPortalApi.refreshSession({
          sessionToken: gate.auth.customerSessionToken ?? extractCustomerSessionToken({ headers, transport: this.customerAuthTransport })
        });
        if (!refreshed.accepted) {
          return this.normalizeError({
            requestId,
            code: ApiErrorCodes.UNAUTHORIZED,
            message: refreshed.reason,
            status: refreshed.status
          });
        }

        const setCookie = buildSessionCookieHeader({
          transport: this.customerAuthTransport,
          sessionToken: refreshed.data?.sessionToken,
          expiresAt: refreshed.data?.expiresAt
        });
        const csrfCookie = buildCsrfCookieHeader({
          csrfPolicy: this.customerCsrfPolicy,
          csrfToken: refreshed.data?.csrfToken,
          expiresAt: refreshed.data?.expiresAt
        });
        return buildSuccess({
          data: this.sanitizeCustomerAuthPayload(refreshed.data),
          responseHeaders: appendSetCookieHeaders(null, setCookie, csrfCookie)
        });
      }

      if (routePath === '/api/v1/customer/session' && method === 'GET') {
        const current = this.customerPortalApi.getCurrentSession({
          sessionToken: gate.auth.customerSessionToken ?? extractCustomerSessionToken({ headers, transport: this.customerAuthTransport })
        });
        if (!current.accepted) {
          return this.normalizeError({
            requestId,
            code: ApiErrorCodes.UNAUTHORIZED,
            message: current.reason,
            status: current.status
          });
        }
        return buildSuccess({ data: current.data });
      }

      if (routePath === '/api/v1/customer/password-reset/request' && method === 'POST') {
        const reset = this.customerPortalApi.requestPasswordReset({ body });
        if (!reset.accepted) {
          return this.normalizeError({
            requestId,
            code: ApiErrorCodes.INVALID_REQUEST,
            message: reset.reason,
            status: reset.status
          });
        }
        return buildSuccess({ data: reset.data });
      }

      if (routePath === '/api/v1/customer/password-reset/complete' && method === 'POST') {
        const reset = this.customerPortalApi.completePasswordReset({ body });
        if (!reset.accepted) {
          return this.normalizeError({
            requestId,
            code: ApiErrorCodes.INVALID_REQUEST,
            message: reset.reason,
            status: reset.status
          });
        }

        const clearCookie = buildClearedSessionCookieHeader({ transport: this.customerAuthTransport });
        const clearCsrfCookie = buildClearedCsrfCookieHeader({ csrfPolicy: this.customerCsrfPolicy });
        return buildSuccess({
          data: reset.data,
          responseHeaders: appendSetCookieHeaders(null, clearCookie, clearCsrfCookie)
        });
      }

      if (routePath === '/api/v1/customer/sessions/revoke-all' && method === 'POST') {
        const customerContext = resolveCustomerContext({ headers, auth: gate.auth });
        const revoke = this.customerPortalApi.revokeAllSessions({ customerId: customerContext.customerId });
        if (!revoke.accepted) {
          return this.normalizeError({
            requestId,
            code: ApiErrorCodes.INVALID_REQUEST,
            message: revoke.reason,
            status: revoke.status
          });
        }

        const clearCookie = buildClearedSessionCookieHeader({ transport: this.customerAuthTransport });
        const clearCsrfCookie = buildClearedCsrfCookieHeader({ csrfPolicy: this.customerCsrfPolicy });
        return buildSuccess({
          data: revoke.data,
          responseHeaders: appendSetCookieHeaders(null, clearCookie, clearCsrfCookie)
        });
      }

      if (routePath === '/api/v1/customer/auth/health' && method === 'GET') {
        const health = this.customerPortalApi.authHealth();
        if (!health.accepted) {
          return this.normalizeError({
            requestId,
            code: ApiErrorCodes.DATA_UNAVAILABLE,
            message: health.reason,
            status: health.status
          });
        }
        return buildSuccess({ data: health.data });
      }

      if (routePath === '/api/v1/customer/payments/checkout' && method === 'POST') {
        const customerContext = resolveCustomerContext({ headers, auth: gate.auth });
        const checkout = this.customerPortalApi.createPaymentCheckout({
          customerId: customerContext.customerId,
          requestedBy: customerContext.requestedBy,
          body
        });

        if (!checkout.accepted) {
          const code = checkout.code === 'NOT_FOUND'
            ? ApiErrorCodes.NOT_FOUND
            : (checkout.code === 'FORBIDDEN' ? ApiErrorCodes.FORBIDDEN : ApiErrorCodes.INVALID_REQUEST);
          return this.normalizeError({
            requestId,
            code,
            message: checkout.reason,
            status: checkout.status
          });
        }

        return buildSuccess({ data: checkout.data });
      }

      if (routePath === '/api/v1/customer/payments/history' && method === 'GET') {
        const customerContext = resolveCustomerContext({ headers, auth: gate.auth });
        const history = this.customerPortalApi.listPaymentHistory({ customerId: customerContext.customerId });
        if (!history.found) {
          return this.normalizeError({
            requestId,
            code: ApiErrorCodes.NOT_FOUND,
            message: history.reason,
            status: history.status
          });
        }

        return buildSuccess({ data: history.data });
      }

      if (routePath === '/api/v1/customer/payments/health' && method === 'GET') {
        const health = this.customerPortalApi.paymentHealth();
        if (!health.accepted) {
          return this.normalizeError({
            requestId,
            code: ApiErrorCodes.DATA_UNAVAILABLE,
            message: health.reason,
            status: health.status
          });
        }

        return buildSuccess({ data: health.data });
      }

      if (routePath === '/api/v1/customer/project/:id') {
        const customerContext = resolveCustomerContext({ headers, auth: gate.auth });
        const project = this.customerPortalApi.getProject({
          customerId: customerContext.customerId,
          projectId: resolved.params.id
        });
        if (!project.found) {
          return this.normalizeError({
            requestId,
            code: ApiErrorCodes.NOT_FOUND,
            message: project.reason,
            status: project.status
          });
        }

        return buildSuccess({ data: project.data });
      }

      if (routePath === '/api/v1/customer/request' && method === 'POST') {
        const customerContext = resolveCustomerContext({ headers, auth: gate.auth });
        const created = this.customerPortalApi.createRequest({
          customerId: customerContext.customerId,
          accountId: customerContext.accountId,
          sessionId: customerContext.sessionId,
          requestedBy: customerContext.requestedBy,
          body
        });

        if (!created.accepted) {
          return this.normalizeError({
            requestId,
            code: created.code === 'INVALID_REQUEST' ? ApiErrorCodes.INVALID_REQUEST : ApiErrorCodes.INVALID_TRANSITION,
            message: created.reason,
            status: created.status
          });
        }

        return buildSuccess({ data: created.data });
      }

      if (routePath === '/api/v1/customer/revision' && method === 'POST') {
        const customerContext = resolveCustomerContext({ headers, auth: gate.auth });
        const revision = this.customerPortalApi.requestRevision({
          customerId: customerContext.customerId,
          requestedBy: customerContext.requestedBy,
          body
        });

        if (!revision.accepted) {
          const code = revision.code === 'NOT_FOUND'
            ? ApiErrorCodes.NOT_FOUND
            : (revision.code === 'FORBIDDEN' ? ApiErrorCodes.FORBIDDEN : ApiErrorCodes.INVALID_REQUEST);

          return this.normalizeError({
            requestId,
            code,
            message: revision.reason,
            status: revision.status
          });
        }

        return buildSuccess({ data: revision.data });
      }

      if (routePath === '/api/v1/customer/project/:id/approve' && method === 'POST') {
        const customerContext = resolveCustomerContext({ headers, auth: gate.auth });
        const approval = this.customerPortalApi.approveCompletion({
          customerId: customerContext.customerId,
          requestedBy: customerContext.requestedBy,
          body: {
            ...body,
            missionId: body.missionId ?? resolved.params.id
          }
        });

        if (!approval.accepted) {
          const code = approval.code === 'NOT_FOUND'
            ? ApiErrorCodes.NOT_FOUND
            : (approval.code === 'FORBIDDEN' ? ApiErrorCodes.FORBIDDEN : ApiErrorCodes.INVALID_REQUEST);
          return this.normalizeError({
            requestId,
            code,
            message: approval.reason,
            status: approval.status
          });
        }

        return buildSuccess({ data: approval.data });
      }

      if (routePath === '/api/v1/customer/downloads/:id') {
        const customerContext = resolveCustomerContext({ headers, auth: gate.auth });
        const downloads = this.customerPortalApi.getDownloads({
          customerId: customerContext.customerId,
          projectId: resolved.params.id
        });

        if (!downloads.found) {
          const code = downloads.code === 'FORBIDDEN'
            ? ApiErrorCodes.FORBIDDEN
            : (downloads.code === 'NOT_FOUND' ? ApiErrorCodes.NOT_FOUND : ApiErrorCodes.INVALID_REQUEST);
          return this.normalizeError({
            requestId,
            code,
            message: downloads.reason,
            status: downloads.status
          });
        }

        return buildSuccess({ data: downloads.data });
      }

      if (routePath === '/api/v1/customer/downloads/:id/authorize' && method === 'POST') {
        const customerContext = resolveCustomerContext({ headers, auth: gate.auth });
        const authorization = this.customerPortalApi.issueDownloadAuthorization({
          customerId: customerContext.customerId,
          projectId: resolved.params.id,
          requestedBy: customerContext.requestedBy,
          body
        });

        if (!authorization.found) {
          const code = authorization.code === 'FORBIDDEN'
            ? ApiErrorCodes.FORBIDDEN
            : (authorization.code === 'NOT_FOUND' ? ApiErrorCodes.NOT_FOUND : ApiErrorCodes.INVALID_REQUEST);
          return this.normalizeError({
            requestId,
            code,
            message: authorization.reason,
            status: authorization.status
          });
        }

        return buildSuccess({ data: authorization.data });
      }

      if (routePath === '/api/v1/customer/downloads/redeem' && method === 'POST') {
        const customerContext = resolveCustomerContext({ headers, auth: gate.auth });
        const redemption = this.customerPortalApi.redeemDownloadAuthorization({
          customerId: customerContext.customerId,
          body
        });

        if (!redemption.found) {
          const code = redemption.code === 'FORBIDDEN'
            ? ApiErrorCodes.FORBIDDEN
            : (redemption.code === 'NOT_FOUND' ? ApiErrorCodes.NOT_FOUND : (redemption.code === 'UNAUTHORIZED' ? ApiErrorCodes.UNAUTHORIZED : ApiErrorCodes.INVALID_REQUEST));
          return this.normalizeError({
            requestId,
            code,
            message: redemption.reason,
            status: redemption.status
          });
        }

        return buildSuccess({ data: redemption.data });
      }

      if (routePath === '/api/v1/mission-control/:missionId' && method === 'GET') {
        const dependencyError = this.ensureServiceDependency({
          requestId,
          dependencyAvailable: Boolean(this.missionControlManager),
          message: 'Mission control service is not available. Inject mission control manager during bootstrap.'
        });
        if (dependencyError) return dependencyError;

        const mission = this.missionControlApi.getMission(resolved.params.missionId);
        if (!mission.found) {
          return this.normalizeError({
            requestId,
            code: ApiErrorCodes.NOT_FOUND,
            message: mission.reason,
            status: 404
          });
        }

        return buildSuccess({ data: mission.data });
      }

      if (method === 'POST' && missionControlCommandByRoute[routePath]) {
        const dependencyError = this.ensureServiceDependency({
          requestId,
          dependencyAvailable: Boolean(this.missionControlManager),
          message: 'Mission control service is not available. Inject mission control manager during bootstrap.'
        });
        if (dependencyError) return dependencyError;

        const command = await this.missionControlApi.issueCommand({
          missionId: resolved.params.missionId,
          commandType: missionControlCommandByRoute[routePath],
          body,
          auth: gate.auth
        });

        if (!command.accepted) {
          const status = Number(command.status ?? 409);
          const codeMap = {
            DUPLICATE_COMMAND: ApiErrorCodes.DUPLICATE_COMMAND,
            STALE_EXPECTED_STATE: ApiErrorCodes.STALE_EXPECTED_STATE,
            INVALID_TRANSITION: ApiErrorCodes.INVALID_TRANSITION,
            NOT_FOUND: ApiErrorCodes.NOT_FOUND,
            INVALID_REQUEST: ApiErrorCodes.INVALID_REQUEST
          };

          return this.normalizeError({
            requestId,
            code: codeMap[command.code] ?? ApiErrorCodes.INVALID_REQUEST,
            message: command.reason ?? 'Mission control command rejected.',
            status
          });
        }

        return buildSuccess({ data: command.data });
      }

      if (routePath === '/api/v1/dashboard/overview') {
        return buildSuccess({ data: snapshot.executiveOverview });
      }

      if (routePath === '/api/v1/dashboard/decisions') {
        const valid = validateFilters(query, SupportedFilters.decisions);
        if (!valid.isValid) {
          return this.normalizeError({
            requestId,
            code: ApiErrorCodes.INVALID_REQUEST,
            message: `Unsupported filters: ${valid.invalid.join(', ')}`,
            status: 400
          });
        }

        const sorted = this.filterDecisionItems(snapshot.ceoDecisionCenter.items ?? [], query);
        const paged = applyPagination(sorted, query);
        return buildSuccess({ data: paged.records, pagination: paged.pagination });
      }

      if (routePath === '/api/v1/dashboard/missions') {
        const valid = validateFilters(query, SupportedFilters.missions);
        if (!valid.isValid) {
          return this.normalizeError({
            requestId,
            code: ApiErrorCodes.INVALID_REQUEST,
            message: `Unsupported filters: ${valid.invalid.join(', ')}`,
            status: 400
          });
        }

        const sorted = this.filterMissionItems(snapshot.missionControl.records ?? [], query);
        const paged = applyPagination(sorted, query);
        return buildSuccess({ data: paged.records, pagination: paged.pagination });
      }

      if (routePath === '/api/v1/dashboard/workforce') {
        return buildSuccess({ data: snapshot.workforce });
      }

      if (routePath === '/api/v1/dashboard/customers') {
        return buildSuccess({ data: snapshot.customerPipeline });
      }

      if (routePath === '/api/v1/dashboard/opportunities') {
        return buildSuccess({ data: snapshot.opportunityPortfolio });
      }

      if (routePath === '/api/v1/dashboard/providers') {
        return buildSuccess({ data: snapshot.providerHealth });
      }

      if (routePath === '/api/v1/dashboard/system-health') {
        return buildSuccess({ data: snapshot.systemHealth });
      }

      if (routePath === '/api/v1/dashboard/activity') {
        const valid = validateFilters(query, SupportedFilters.activity);
        if (!valid.isValid) {
          return this.normalizeError({
            requestId,
            code: ApiErrorCodes.INVALID_REQUEST,
            message: `Unsupported filters: ${valid.invalid.join(', ')}`,
            status: 400
          });
        }

        const sorted = this.filterActivityItems(snapshot.activityFeed.events ?? [], query);
        const paged = applyPagination(sorted, query);
        return buildSuccess({ data: paged.records, pagination: paged.pagination });
      }

      if (routePath === '/api/v1/dashboard/alerts') {
        const valid = validateFilters(query, SupportedFilters.alerts);
        if (!valid.isValid) {
          return this.normalizeError({
            requestId,
            code: ApiErrorCodes.INVALID_REQUEST,
            message: `Unsupported filters: ${valid.invalid.join(', ')}`,
            status: 400
          });
        }

        const sorted = this.filterAlertItems(snapshot.alerts.alerts ?? [], query);
        const paged = applyPagination(sorted, query);
        return buildSuccess({ data: paged.records, pagination: paged.pagination });
      }

      if (routePath === '/api/v1/dashboard/snapshots') {
        const metadata = this.retention.listSnapshotMetadata();
        const sorted = stableSort(metadata, SortingDefaults.snapshots.field, SortingDefaults.snapshots.direction);
        const paged = applyPagination(sorted, query);
        return buildSuccess({ data: paged.records, pagination: paged.pagination });
      }

      if (routePath === '/api/v1/dashboard/snapshots/:snapshotId') {
        const snapshotLookup = this.retention.getSnapshotById(resolved.params.snapshotId);
        if (!snapshotLookup.found) {
          return this.normalizeError({
            requestId,
            code: ApiErrorCodes.NOT_FOUND,
            message: snapshotLookup.reason,
            status: 404
          });
        }

        return buildSuccess({ data: snapshotLookup.snapshot });
      }

      if (routePath === '/api/v1/dashboard/health') {
        return buildSuccess({ data: this.buildHealthPayload() });
      }

      if (routePath === '/api/v1/dashboard/metadata') {
        return buildSuccess({ data: this.metadataPayload() });
      }

      if (routePath === '/api/v1/payments/webhook/stripe' && method === 'POST') {
        const rawBody = typeof body === 'string' ? body : JSON.stringify(body ?? {});
        const webhook = this.customerPortalApi.handlePaymentWebhook({
          providerType: 'stripe',
          headers,
          body,
          rawBody
        });

        if (!webhook.accepted) {
          const code = webhook.code === 'WEBHOOK_REJECTED'
            ? ApiErrorCodes.UNAUTHORIZED
            : (webhook.code === 'NOT_FOUND' ? ApiErrorCodes.NOT_FOUND : ApiErrorCodes.INVALID_REQUEST);
          return this.normalizeError({
            requestId,
            code,
            message: webhook.reason,
            status: webhook.status
          });
        }

        return buildSuccess({ data: webhook.data });
      }

      return this.normalizeError({
        requestId,
        code: ApiErrorCodes.NOT_FOUND,
        message: 'Route not found.',
        status: 404
      });
    } catch (error) {
      this.lastDashboardError = error instanceof Error ? error : new Error(String(error));
      const normalized = this.normalizeError({
        requestId,
        code: ApiErrorCodes.INTERNAL_ERROR,
        message: 'Internal API error.',
        status: 500
      });

      this.auditLog.record({
        requestId,
        role: gate.auth.role,
        endpoint: routePath,
        operation: 'READ',
        success: false,
        responseCategory: ApiErrorCodes.INTERNAL_ERROR,
        filters: query,
        clientId,
        durationMs: Date.now() - startedAt,
        deniedReason: 'INTERNAL_ERROR'
      });

      return normalized;
    }
  }
}
