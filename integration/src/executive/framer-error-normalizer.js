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
  if (lower.includes('unauthorized') || lower.includes('forbidden') || lower.includes('api key')) {
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
