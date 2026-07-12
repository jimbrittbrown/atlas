import { ExecutiveDashboardApiService } from '../../../integration/src/executive/executive-dashboard-api-service.js';
import { ExecutiveDashboardApiAuth } from '../../../integration/src/executive/executive-dashboard-api-auth.js';

const env = {
  ATLAS_DASHBOARD_API_TOKEN: process.env.ATLAS_DASHBOARD_API_TOKEN || 'atlas-dev-token',
};

async function main() {
  const service = new ExecutiveDashboardApiService({ auth: new ExecutiveDashboardApiAuth({ env }) });
  const response = await service.handleRequest({
    method: 'GET',
    path: '/api/v1/dashboard',
    headers: { authorization: `Bearer ${env.ATLAS_DASHBOARD_API_TOKEN}` },
    clientId: 'ceo-dashboard-frontend-validation',
  });

  if (response.httpStatus !== 200 || !response.envelope.success) {
    throw new Error(`Overview data path failed with status ${response.httpStatus}`);
  }

  const data = response.envelope.data;
  if (!data.executiveOverview || !data.generatedAt || !Array.isArray(data.dataFreshness)) {
    throw new Error('Overview data path returned invalid snapshot shape.');
  }

  console.log('Overview data path validated through ExecutiveDashboardApiService.');
  console.log(`Request ID: ${response.envelope.requestId}`);
  console.log(`Dashboard status: ${data.dashboardStatus}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
