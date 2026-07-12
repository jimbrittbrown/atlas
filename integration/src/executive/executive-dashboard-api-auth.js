import { createHash, timingSafeEqual } from 'node:crypto';
import { ApiRoles } from './executive-dashboard-api-contracts.js';

function secureCompare(a, b) {
  const left = Buffer.from(String(a ?? ''), 'utf8');
  const right = Buffer.from(String(b ?? ''), 'utf8');

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function parseOptionalInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export class ExecutiveDashboardApiAuth {
  constructor({ env = process.env } = {}) {
    this.env = env;
    this.roleTokenMap = this.loadRoleTokenMap();
  }

  loadRoleTokenMap() {
    const map = new Map();

    const defaultToken = this.env.ATLAS_DASHBOARD_API_TOKEN;
    if (String(defaultToken ?? '').trim().length > 0) {
      map.set(ApiRoles.CEO, String(defaultToken));
    }

    Object.values(ApiRoles).forEach((role) => {
      const envKey = `ATLAS_DASHBOARD_API_TOKEN_${role}`;
      const value = this.env[envKey];
      if (String(value ?? '').trim().length > 0) {
        map.set(role, String(value));
      }
    });

    return map;
  }

  isConfigured() {
    return this.roleTokenMap.size > 0;
  }

  validateConfiguration() {
    const issues = [];
    if (!this.isConfigured()) {
      issues.push('No dashboard API token configured. Set ATLAS_DASHBOARD_API_TOKEN or role-specific token env vars.');
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  extractToken(headers = {}) {
    const authHeader = headers.authorization ?? headers.Authorization ?? '';
    const serviceToken = headers['x-atlas-token'] ?? headers['X-Atlas-Token'] ?? null;

    if (typeof serviceToken === 'string' && serviceToken.trim().length > 0) {
      return serviceToken.trim();
    }

    if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
      return authHeader.slice(7).trim();
    }

    return null;
  }

  authenticate({ headers = {} } = {}) {
    const config = this.validateConfiguration();

    if (!config.isValid) {
      return {
        authenticated: false,
        reason: 'Authentication is not configured.',
        role: null,
        tokenFingerprint: null
      };
    }

    const token = this.extractToken(headers);
    if (!token) {
      return {
        authenticated: false,
        reason: 'Missing credentials.',
        role: null,
        tokenFingerprint: null
      };
    }

    for (const [role, expectedToken] of this.roleTokenMap.entries()) {
      if (secureCompare(token, expectedToken)) {
        return {
          authenticated: true,
          reason: null,
          role,
          tokenFingerprint: this.fingerprint(token)
        };
      }
    }

    return {
      authenticated: false,
      reason: 'Invalid credentials.',
      role: null,
      tokenFingerprint: this.fingerprint(token)
    };
  }

  fingerprint(token) {
    const hash = createHash('sha256').update(String(token ?? ''), 'utf8').digest('hex');
    return hash.slice(0, 12);
  }

  redactToken(token) {
    if (!token) return null;
    return `redacted:${this.fingerprint(token)}`;
  }

  getConfigSummary() {
    return {
      configured: this.isConfigured(),
      configuredRoles: Array.from(this.roleTokenMap.keys()),
      tokenLengthPolicy: {
        minRecommendedLength: parseOptionalInt(this.env.ATLAS_DASHBOARD_API_MIN_TOKEN_LENGTH, 24)
      }
    };
  }
}
