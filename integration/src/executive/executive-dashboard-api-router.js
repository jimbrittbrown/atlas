import { RouteDefinitions } from './executive-dashboard-api-contracts.js';

function parsePathParams(pattern, path) {
  const patternParts = String(pattern).split('/').filter(Boolean);
  const pathParts = String(path).split('/').filter(Boolean);

  if (patternParts.length !== pathParts.length) {
    return { matched: false, params: {} };
  }

  const params = {};

  for (let i = 0; i < patternParts.length; i += 1) {
    const p = patternParts[i];
    const v = pathParts[i];

    if (p.startsWith(':')) {
      params[p.slice(1)] = v;
      continue;
    }

    if (p !== v) {
      return { matched: false, params: {} };
    }
  }

  return { matched: true, params };
}

export class ExecutiveDashboardApiRouter {
  constructor({ routes = RouteDefinitions } = {}) {
    this.routes = routes;
  }

  resolve({ method, path }) {
    const normalizedMethod = String(method ?? '').toUpperCase();
    const normalizedPath = String(path ?? '').split('?')[0];

    for (const route of this.routes) {
      if (String(route.method).toUpperCase() !== normalizedMethod) continue;
      const parsed = parsePathParams(route.path, normalizedPath);
      if (!parsed.matched) continue;
      return {
        found: true,
        route,
        params: parsed.params
      };
    }

    return {
      found: false,
      route: null,
      params: {}
    };
  }
}
