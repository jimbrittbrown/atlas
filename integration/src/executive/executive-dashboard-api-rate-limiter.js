export class ExecutiveDashboardApiRateLimiter {
  constructor({
    requestsPerWindow = Number.parseInt(process.env.ATLAS_DASHBOARD_API_RATE_LIMIT_REQUESTS ?? '120', 10),
    windowMs = Number.parseInt(process.env.ATLAS_DASHBOARD_API_RATE_LIMIT_WINDOW_MS ?? '60000', 10),
    now = () => Date.now()
  } = {}) {
    this.requestsPerWindow = Number.isFinite(requestsPerWindow) ? requestsPerWindow : 120;
    this.windowMs = Number.isFinite(windowMs) ? windowMs : 60000;
    this.now = now;
    this.windows = new Map();
  }

  key(clientId = 'anonymous') {
    return String(clientId || 'anonymous');
  }

  check(clientId) {
    const key = this.key(clientId);
    const now = this.now();

    let state = this.windows.get(key);
    if (!state || now - state.windowStart >= this.windowMs) {
      state = {
        windowStart: now,
        count: 0
      };
      this.windows.set(key, state);
    }

    state.count += 1;

    const remaining = Math.max(this.requestsPerWindow - state.count, 0);
    const resetAt = state.windowStart + this.windowMs;

    if (state.count > this.requestsPerWindow) {
      return {
        allowed: false,
        remaining,
        resetAt,
        limit: this.requestsPerWindow
      };
    }

    return {
      allowed: true,
      remaining,
      resetAt,
      limit: this.requestsPerWindow
    };
  }

  getStatus() {
    return {
      enabled: true,
      requestsPerWindow: this.requestsPerWindow,
      windowMs: this.windowMs,
      trackedClients: this.windows.size
    };
  }
}
