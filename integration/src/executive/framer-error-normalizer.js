export class FramerAdapterError extends Error {
  constructor({
    message,
    code = 'FRAMER_UNKNOWN_ERROR',
    retryable = false,
    stage = 'UNKNOWN',
    operation = 'UNKNOWN',
    details = null
  }) {
    super(message);
    this.name = 'FramerAdapterError';
    this.provider = 'FRAMER';
    this.code = code;
    this.retryable = retryable;
    this.stage = stage;
    this.operation = operation;
    this.details = details;
  }
}

export function normalizeFramerError(error, context = {}) {
  if (error instanceof FramerAdapterError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = String(message || 'Unknown Framer error');

  const lower = normalizedMessage.toLowerCase();
  const retryable =
    lower.includes('timeout')
    || lower.includes('temporar')
    || lower.includes('rate limit')
    || lower.includes('network')
    || lower.includes('ecconnreset')
    || lower.includes('econnreset');

  let code = 'FRAMER_PROVIDER_ERROR';
  if (lower.includes('api key does not have access to this project') || lower.includes('does not have access to this project')) {
    code = 'FRAMER_PROJECT_ACCESS_DENIED';
  } else if (lower.includes('invalid api key') || lower.includes('api key invalid') || lower.includes('bad api key')) {
    code = 'FRAMER_INVALID_API_KEY';
  } else if (lower.includes('project not found') || lower.includes('unknown project') || lower.includes('project url')) {
    code = 'FRAMER_PROJECT_URL_MISMATCH';
  } else if ((lower.includes('publish') || lower.includes('deploy')) && (lower.includes('permission') || lower.includes('not allowed') || lower.includes('forbidden'))) {
    code = 'FRAMER_PUBLISH_PERMISSION_DENIED';
  } else if (lower.includes('unauthorized') || lower.includes('forbidden') || lower.includes('api key')) {
    code = 'FRAMER_AUTH_ERROR';
  } else if (lower.includes('not supported') || lower.includes('missing method')) {
    code = 'FRAMER_UNSUPPORTED_OPERATION';
  } else if (lower.includes('validation')) {
    code = 'FRAMER_VALIDATION_ERROR';
  }

  return new FramerAdapterError({
    message: normalizedMessage,
    code,
    retryable,
    stage: context.stage ?? 'UNKNOWN',
    operation: context.operation ?? 'UNKNOWN',
    details: context.details ?? null
  });
}
