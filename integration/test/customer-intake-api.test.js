import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutiveDashboardApiService } from '../src/executive/executive-dashboard-api-service.js';
import { ExecutiveOperationsDashboard } from '../src/executive/executive-operations-dashboard.js';
import { ExecutiveOperationsDashboardManager } from '../src/executive/executive-operations-dashboard-manager.js';
import { CustomerIntakeMissionControl } from '../src/executive/customer-intake-mission-control.js';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { ExecutiveDashboardApiAuth } from '../src/executive/executive-dashboard-api-auth.js';
import { CustomerPortalManager } from '../src/executive/customer-portal-manager.js';

function createApi() {
  const missionControl = new CustomerIntakeMissionControl();
  const planning = new ExecutivePlanningSystem({ missionControl });
  const manager = new ExecutiveOperationsDashboardManager({
    missionControl,
    executivePlanningSystem: planning,
    customerPortalManager: new CustomerPortalManager({
      missionControl,
      executivePlanningSystem: planning,
      workforceDirector: missionControl.workforceDirector
    })
  });

  const dashboard = new ExecutiveOperationsDashboard({ manager });
  const api = new ExecutiveDashboardApiService({
    dashboard,
    env: {
      ...process.env,
      ATLAS_CUSTOMER_AUTH_TRANSPORT_MODE: 'development_token',
      ATLAS_CUSTOMER_AUTH_ALLOW_DEVELOPMENT_TOKEN_TRANSPORT: 'true'
    },
    auth: new ExecutiveDashboardApiAuth({ env: {
      ATLAS_DASHBOARD_API_TOKEN_CUSTOMER: 'token-customer',
      ATLAS_DASHBOARD_API_TOKEN: 'token-ceo'
    } })
  });

  return { api, missionControl };
}

async function call(api, {
  path,
  method = 'GET',
  body = {},
  customerId = null,
  token = 'token-customer',
  sessionToken = null,
  extraHeaders = {}
} = {}) {
  const headers = {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...extraHeaders
  };

  if (customerId) {
    headers['x-customer-id'] = customerId;
  }

  if (sessionToken) {
    headers['x-customer-session-token'] = sessionToken;
  }

  return api.handleRequest({
    method,
    path,
    body,
    headers
  });
}

test('customer intake request creates customer and mission', async () => {
  const { api, missionControl } = createApi();

  const created = await call(api, {
    method: 'POST',
    path: '/api/v1/customer/request',
    body: {
      businessName: 'Atlas Customer Portal Intake',
      businessType: 'Media',
      websiteUrl: 'https://customer-portal-intake.example',
      contactName: 'Taylor Intake',
      email: 'taylor@customer-portal-intake.example',
      phone: '+1-555-0121',
      targetAudience: 'SMB buyers',
      businessDescription: 'Production customer portal intake validation.',
      goals: ['Launch lead generation site'],
      budget: '$10,000 - $20,000',
      timeline: '8 weeks',
      preferredStyle: 'Editorial',
      preferredColors: ['#112233'],
      desiredPages: ['home', 'services', 'contact'],
      specialFeatures: ['booking'],
      competitors: ['competitor-a.example'],
      notes: 'Priority kickoff',
      logoUpload: { name: 'logo.svg', size: 1024, type: 'image/svg+xml' },
      imageUploads: [{ name: 'hero.jpg', size: 2048, type: 'image/jpeg' }],
      brandAssetsUpload: [{ name: 'brand-guide.pdf', size: 4048, type: 'application/pdf' }]
    }
  });

  assert.equal(created.httpStatus, 200);
  assert.equal(created.envelope.data.missionType, 'WEBSITE_BUILD');

  const mission = missionControl.missionRegistry.getMissionById(created.envelope.data.missionId);
  assert.equal(Boolean(mission), true);
  assert.equal(mission.missionType, 'WEBSITE_BUILD');
});

test('customer projects endpoint returns dashboard data', async () => {
  const { api } = createApi();

  const created = await call(api, {
    method: 'POST',
    path: '/api/v1/customer/request',
    body: {
      businessName: 'Atlas Customer Portal Dashboard',
      businessType: 'Professional Services',
      websiteUrl: 'https://customer-portal-dashboard.example',
      contactName: 'Morgan Dashboard',
      email: 'morgan@customer-portal-dashboard.example',
      phone: '+1-555-0122',
      targetAudience: 'Service buyers',
      businessDescription: 'Dashboard listing validation.',
      goals: ['Improve conversion'],
      budget: '$8,000 - $14,000',
      timeline: '7 weeks',
      desiredPages: ['home', 'about', 'contact']
    }
  });

  const customerId = created.envelope.data.customerId;

  const projects = await call(api, {
    path: '/api/v1/customer/projects',
    customerId
  });

  assert.equal(projects.httpStatus, 200);
  assert.equal(projects.envelope.data.customerId, customerId);
  assert.equal(projects.envelope.data.projects.length >= 1, true);
});

test('customer revision endpoint creates linked mission', async () => {
  const { api, missionControl } = createApi();

  const created = await call(api, {
    method: 'POST',
    path: '/api/v1/customer/request',
    body: {
      businessName: 'Atlas Customer Portal Revision',
      businessType: 'Agency',
      websiteUrl: 'https://customer-portal-revision.example',
      contactName: 'Jordan Revision',
      email: 'jordan@customer-portal-revision.example',
      phone: '+1-555-0123',
      targetAudience: 'Agency clients',
      businessDescription: 'Revision flow validation.',
      goals: ['Request revisions'],
      budget: '$12,000 - $24,000',
      timeline: '9 weeks',
      desiredPages: ['home', 'work', 'contact']
    }
  });

  const customerId = created.envelope.data.customerId;
  const missionId = created.envelope.data.missionId;

  const revision = await call(api, {
    method: 'POST',
    path: '/api/v1/customer/revision',
    customerId,
    body: {
      missionId,
      reason: 'Need messaging changes',
      notes: 'Adjust hero copy'
    }
  });

  assert.equal(revision.httpStatus, 200);
  const revisionMission = missionControl.missionRegistry.getMissionById(revision.envelope.data.revisionMissionId);
  assert.equal(Boolean(revisionMission), true);
  assert.equal(revisionMission.revisionOfMissionId, missionId);
});

test('customer secure session flow authenticates customer routes without dashboard token', async () => {
  const { api } = createApi();

  const register = await call(api, {
    method: 'POST',
    path: '/api/v1/customer/register',
    token: null,
    body: {
      email: 'secure-session-customer@atlas.example',
      password: 'atlas-pass-1234',
      companyName: 'Secure Session Customer'
    }
  });

  assert.equal(register.httpStatus, 200);
  assert.equal(register.envelope.data.customerId.length > 0, true);

  const login = await call(api, {
    method: 'POST',
    path: '/api/v1/customer/login',
    token: null,
    body: {
      email: 'secure-session-customer@atlas.example',
      password: 'atlas-pass-1234'
    }
  });

  assert.equal(login.httpStatus, 200);
  assert.equal(typeof login.envelope.data.sessionToken, 'string');

  const projects = await call(api, {
    method: 'GET',
    path: '/api/v1/customer/projects',
    token: null,
    sessionToken: login.envelope.data.sessionToken
  });

  assert.equal(projects.httpStatus, 200);
  assert.equal(projects.envelope.data.customerId, login.envelope.data.customerId);
});

test('customer password reset request and completion endpoints return expected responses', async () => {
  const { api } = createApi();

  await call(api, {
    method: 'POST',
    path: '/api/v1/customer/register',
    token: null,
    body: {
      email: 'reset-customer@atlas.example',
      password: 'atlas-pass-1234'
    }
  });

  const requestReset = await call(api, {
    method: 'POST',
    path: '/api/v1/customer/password-reset/request',
    token: null,
    body: {
      email: 'reset-customer@atlas.example'
    }
  });

  assert.equal(requestReset.httpStatus, 200);
  assert.equal(requestReset.envelope.data.accepted, true);
  assert.equal(requestReset.envelope.data.developmentResetToken, null);

  const provider = api.customerPortalManager.authManager.identityProvider;
  const resetRecords = Array.from(provider.resetTokens.values()).filter((item) => item.email === 'reset-customer@atlas.example' && item.used === false);
  assert.equal(resetRecords.length > 0, true);
  const resetHash = Array.from(provider.resetTokens.keys()).find((key) => {
    const record = provider.resetTokens.get(key);
    return record?.email === 'reset-customer@atlas.example' && record?.used === false;
  });
  assert.equal(typeof resetHash, 'string');

  const completeReset = await call(api, {
    method: 'POST',
    path: '/api/v1/customer/password-reset/complete',
    token: null,
    body: {
      token: 'invalid-reset-token',
      newPassword: 'atlas-pass-5678'
    }
  });

  assert.equal(completeReset.httpStatus, 400);
});
