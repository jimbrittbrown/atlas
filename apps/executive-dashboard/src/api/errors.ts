import type { ApiErrorCode } from './types';

export class DashboardApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | 'NETWORK_FAILURE' | 'TIMEOUT' | 'UNKNOWN';

  constructor(message: string, status: number, code: DashboardApiError['code']) {
    super(message);
    this.name = 'DashboardApiError';
    this.status = status;
    this.code = code;
  }
}

export function toUserSafeError(error: unknown): DashboardApiError {
  if (error instanceof DashboardApiError) return error;

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new DashboardApiError('The request timed out. Please retry.', 408, 'TIMEOUT');
  }

  return new DashboardApiError('Unable to reach Atlas dashboard API.', 0, 'NETWORK_FAILURE');
}

export function messageForApiCode(code: DashboardApiError['code']): string {
  if (code === 'UNAUTHORIZED') return 'Authentication required. Provide a valid dashboard token.';
  if (code === 'FORBIDDEN') return 'Your role does not have access to this dashboard view.';
  if (code === 'RATE_LIMITED') return 'Atlas API rate limit reached. Wait and retry.';
  if (code === 'DATA_UNAVAILABLE') return 'Dashboard snapshot is currently unavailable.';
  if (code === 'INVALID_REQUEST') return 'Request parameters were invalid.';
  if (code === 'TIMEOUT') return 'Request timed out before Atlas responded.';
  if (code === 'NETWORK_FAILURE') return 'Network connection to Atlas API failed.';
  return 'Unexpected dashboard error.';
}
