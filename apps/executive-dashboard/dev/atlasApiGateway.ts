import type { Connect, ViteDevServer } from 'vite';

function toQueryObject(url: URL): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    result[key] = value;
  }
  return result;
}

async function buildService() {
  const serviceModulePath = '../../../integration/src/executive/executive-dashboard-api-service.js';
  const authModulePath = '../../../integration/src/executive/executive-dashboard-api-auth.js';

  const [{ ExecutiveDashboardApiService }, { ExecutiveDashboardApiAuth }] = await Promise.all([
    import(serviceModulePath),
    import(authModulePath),
  ]);

  const auth = new ExecutiveDashboardApiAuth({ env: process.env });
  return new ExecutiveDashboardApiService({ auth });
}

export function atlasApiGatewayPlugin() {
  let service: null | { handleRequest: (request: Record<string, unknown>) => Promise<{ httpStatus: number; envelope: unknown }> } = null;

  const middleware: Connect.NextHandleFunction = async (req, res, next) => {
    const method = String(req.method ?? 'GET').toUpperCase();
    if (method !== 'GET') {
      next();
      return;
    }

    const requestUrl = req.url ?? '';
    if (!requestUrl.startsWith('/atlas-api/')) {
      next();
      return;
    }

    if (!service) service = await buildService();
    const liveService = service;
    if (!liveService) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Gateway service unavailable.' } }));
      return;
    }

    const url = new URL(requestUrl, 'http://localhost');
    const targetPath = url.pathname.replace('/atlas-api', '');

    const result = await liveService.handleRequest({
      method: 'GET',
      path: targetPath,
      query: toQueryObject(url),
      headers: {
        authorization: req.headers.authorization,
        'x-client-id': req.headers['x-client-id'] ?? 'atlas-ceo-dashboard-web',
      },
      clientId: String(req.headers['x-client-id'] ?? 'atlas-ceo-dashboard-web'),
    });

    res.statusCode = result.httpStatus;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(result.envelope));
  };

  return {
    name: 'atlas-api-gateway-plugin',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(middleware);
    },
  };
}
