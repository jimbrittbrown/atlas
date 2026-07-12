import { appConfig } from '../config';
import { DashboardApiError, messageForApiCode, toUserSafeError } from './errors';
import type {
  ApiEnvelope,
  CustomerCompletionApprovalResponse,
  CustomerDownloadsResponse,
  CustomerCurrentSessionResponse,
  CustomerLoginResponse,
  CustomerPasswordResetCompleteResponse,
  CustomerPasswordResetRequestResponse,
  CustomerProjectRecord,
  CustomerProjectsResponse,
  CustomerRegistrationResponse,
  CustomerRequestPayload,
  CustomerRequestResponse,
  CustomerRevisionResponse,
  CustomerSessionRefreshResponse,
  DashboardQueryResult,
  DashboardSnapshot,
} from './types';
import { parseDashboardEnvelope } from './validators';
import { dashboardFixtureEnvelope } from '../fixtures/dashboardFixture';

export type DashboardRequestOptions = {
  token: string;
  role: string;
  mode: 'live' | 'fixture';
  signal?: AbortSignal;
};

export type CustomerRequestOptions = {
  token?: string;
  customerId?: string;
  accountId?: string;
  sessionToken?: string;
  signal?: AbortSignal;
};

function readCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const entries = String(document.cookie ?? '').split(';').map((item) => item.trim()).filter(Boolean);
  for (const entry of entries) {
    const index = entry.indexOf('=');
    if (index <= 0) continue;
    const key = entry.slice(0, index).trim();
    if (key !== name) continue;
    return decodeURIComponent(entry.slice(index + 1));
  }
  return null;
}

export function clearCustomerCsrfCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = `${appConfig.customerCsrfCookieName}=; Path=/api/v1/customer; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

function timeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(Math.max(1, timeoutMs));
}

export async function fetchDashboardSnapshot(options: DashboardRequestOptions): Promise<DashboardQueryResult> {
  if (options.mode === 'fixture') {
    return {
      mode: 'fixture',
      sourceLabel: 'DEVELOPMENT_DATA',
      envelope: dashboardFixtureEnvelope,
    };
  }

  const controller = new AbortController();
  const timeout = timeoutSignal(appConfig.requestTimeoutMs);
  const onAbort = () => controller.abort();
  timeout.addEventListener('abort', onAbort);
  options.signal?.addEventListener('abort', onAbort);

  try {
    const response = await fetch(`${appConfig.apiBaseUrl}/api/v1/dashboard`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${options.token}`,
        'x-client-id': 'atlas-ceo-dashboard-web',
        'x-atlas-role-hint': options.role,
      },
      signal: controller.signal,
    });

    const payload = (await response.json()) as ApiEnvelope<DashboardSnapshot>;

    if (!response.ok || !payload.success) {
      const code = payload.error?.code ?? 'UNKNOWN';
      throw new DashboardApiError(messageForApiCode(code), response.status, code);
    }

    const parsed = parseDashboardEnvelope(payload);

    return {
      mode: 'live',
      sourceLabel: 'LIVE_API',
      envelope: parsed,
    };
  } catch (error) {
    throw toUserSafeError(error);
  } finally {
    timeout.removeEventListener('abort', onAbort);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

async function customerRequest<T>(
  path: string,
  options: CustomerRequestOptions,
  init: RequestInit = {}
): Promise<T> {
  const controller = new AbortController();
  const timeout = timeoutSignal(appConfig.requestTimeoutMs);
  const onAbort = () => controller.abort();
  timeout.addEventListener('abort', onAbort);
  options.signal?.addEventListener('abort', onAbort);

  try {
    const method = String(init.method ?? 'GET').toUpperCase();
    const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const csrfToken = isMutating ? readCookieValue(appConfig.customerCsrfCookieName) : null;

    const response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        'x-client-id': 'atlas-customer-portal-web',
        ...(options.customerId ? { 'x-customer-id': options.customerId } : {}),
        ...(options.accountId ? { 'x-customer-account-id': options.accountId } : {}),
        ...(appConfig.customerSessionHeaderTransportEnabled && options.sessionToken
          ? { 'x-customer-session-token': options.sessionToken }
          : {}),
        ...(csrfToken ? { [appConfig.customerCsrfHeaderName]: csrfToken } : {}),
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });

    const payload = (await response.json()) as ApiEnvelope<T>;

    if (!response.ok || !payload.success) {
      const code = payload.error?.code ?? 'UNKNOWN';
      throw new DashboardApiError(messageForApiCode(code), response.status, code);
    }

    return payload.data;
  } catch (error) {
    throw toUserSafeError(error);
  } finally {
    timeout.removeEventListener('abort', onAbort);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

export async function fetchCustomerProjects(options: CustomerRequestOptions): Promise<CustomerProjectsResponse> {
  return customerRequest<CustomerProjectsResponse>('/api/v1/customer/projects', options, { method: 'GET' });
}

export async function loginCustomerPortal(
  payload: { email: string; password: string },
  options: CustomerRequestOptions
): Promise<CustomerLoginResponse> {
  return customerRequest<CustomerLoginResponse>('/api/v1/customer/login', options, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function registerCustomerPortal(
  payload: { email: string; password: string; companyName?: string; contactName?: string },
  options: CustomerRequestOptions
): Promise<CustomerRegistrationResponse> {
  return customerRequest<CustomerRegistrationResponse>('/api/v1/customer/register', options, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function logoutCustomerPortal(options: CustomerRequestOptions): Promise<{ loggedOut: boolean }> {
  return customerRequest<{ loggedOut: boolean }>('/api/v1/customer/logout', options, { method: 'POST' });
}

export async function refreshCustomerSession(options: CustomerRequestOptions): Promise<CustomerSessionRefreshResponse> {
  return customerRequest<CustomerSessionRefreshResponse>('/api/v1/customer/session/refresh', options, { method: 'POST' });
}

export async function getCurrentCustomerSession(options: CustomerRequestOptions): Promise<CustomerCurrentSessionResponse> {
  return customerRequest<CustomerCurrentSessionResponse>('/api/v1/customer/session', options, { method: 'GET' });
}

export async function requestCustomerPasswordReset(
  payload: { email: string },
  options: CustomerRequestOptions
): Promise<CustomerPasswordResetRequestResponse> {
  return customerRequest<CustomerPasswordResetRequestResponse>('/api/v1/customer/password-reset/request', options, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function completeCustomerPasswordReset(
  payload: { token: string; newPassword: string },
  options: CustomerRequestOptions
): Promise<CustomerPasswordResetCompleteResponse> {
  return customerRequest<CustomerPasswordResetCompleteResponse>('/api/v1/customer/password-reset/complete', options, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchCustomerProject(projectId: string, options: CustomerRequestOptions): Promise<CustomerProjectRecord> {
  return customerRequest<CustomerProjectRecord>(`/api/v1/customer/project/${projectId}`, options, { method: 'GET' });
}

export async function createCustomerWebsiteRequest(
  payload: CustomerRequestPayload,
  options: CustomerRequestOptions
): Promise<CustomerRequestResponse> {
  return customerRequest<CustomerRequestResponse>('/api/v1/customer/request', options, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function requestCustomerRevision(
  payload: { missionId: string; reason: string; notes?: string },
  options: CustomerRequestOptions
): Promise<CustomerRevisionResponse> {
  return customerRequest<CustomerRevisionResponse>('/api/v1/customer/revision', options, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchCustomerDownloads(projectId: string, options: CustomerRequestOptions): Promise<CustomerDownloadsResponse> {
  return customerRequest<CustomerDownloadsResponse>(`/api/v1/customer/downloads/${projectId}`, options, { method: 'GET' });
}

export async function approveCustomerCompletion(
  payload: { missionId: string; notes?: string },
  options: CustomerRequestOptions
): Promise<CustomerCompletionApprovalResponse> {
  return customerRequest<CustomerCompletionApprovalResponse>(`/api/v1/customer/project/${payload.missionId}/approve`, options, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
