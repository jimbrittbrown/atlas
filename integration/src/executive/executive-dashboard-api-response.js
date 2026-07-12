import { randomUUID } from 'node:crypto';

export function createRequestId() {
  return `req_${randomUUID()}`;
}

export function createEnvelope({
  success,
  status,
  requestId,
  data = null,
  pagination = null,
  dataFreshness = null,
  warnings = [],
  limitations = [],
  error = null
} = {}) {
  return {
    success,
    status,
    requestId,
    timestamp: new Date().toISOString(),
    data,
    pagination,
    dataFreshness,
    warnings,
    limitations,
    error
  };
}

export function createErrorPayload({ code, message, details = null } = {}) {
  return {
    code,
    message,
    details
  };
}
