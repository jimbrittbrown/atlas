import test from 'node:test';
import assert from 'node:assert/strict';
import { CustomerIntakeMissionControl } from '../src/executive/customer-intake-mission-control.js';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { ExecutiveOperationsDashboardManager } from '../src/executive/executive-operations-dashboard-manager.js';
import { ExecutiveOperationsDashboard } from '../src/executive/executive-operations-dashboard.js';
import { ExecutiveDashboardApiService } from '../src/executive/executive-dashboard-api-service.js';
import { ExecutiveDashboardApiAuth } from '../src/executive/executive-dashboard-api-auth.js';
import { CustomerPortalManager } from '../src/executive/customer-portal-manager.js';

function createSystem() {
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
      ATLAS_DASHBOARD_API_TOKEN: 'token-ceo',
      ATLAS_DASHBOARD_API_TOKEN_VIEWER: 'token-viewer'
    } })
  });

  return { manager, api };
}

function customerHeaders(customerId = null) {
  return {
    authorization: 'Bearer token-customer',
    ...(customerId ? { 'x-customer-id': customerId } : {})
  };
}

test('website business launch stack routes request and supports login/project lifecycle', async () => {
  const { api } = createSystem();

  const created = await api.handleRequest({
    method: 'POST',
    path: '/api/v1/customer/request',
    headers: customerHeaders(),
    body: {
      businessName: 'Atlas Website Studio Prospect',
      businessType: 'Professional Services',
      websiteUrl: 'https://atlas-website-studio-prospect.example',
      contactName: 'Jamie Prospect',
      email: 'jamie@atlas-website-studio-prospect.example',
      phone: '+1-555-0910',
      targetAudience: 'Growth teams',
      businessDescription: 'Need a new service website with conversion flow.',
      goals: ['Launch website', 'Increase leads'],
      budget: '$12,000 - $25,000',
      timeline: '8 weeks',
      desiredPages: ['home', 'services', 'portfolio', 'pricing', 'contact'],
      preferredColors: ['#113355']
    }
  });

  assert.equal(created.httpStatus, 200);
  assert.equal(created.envelope.data.missionType, 'WEBSITE_BUILD');

  const registration = await api.handleRequest({
    method: 'POST',
    path: '/api/v1/customer/register',
    headers: customerHeaders(),
    body: {
      email: 'jamie@atlas-website-studio-prospect.example',
      password: 'atlas-pass-1234',
      companyName: 'Atlas Website Studio Prospect',
      contactName: 'Jamie Prospect'
    }
  });

  assert.equal(registration.httpStatus, 200);

  const login = await api.handleRequest({
    method: 'POST',
    path: '/api/v1/customer/login',
    headers: customerHeaders(),
    body: {
      email: 'jamie@atlas-website-studio-prospect.example',
      password: 'atlas-pass-1234',
      customerId: created.envelope.data.customerId
    }
  });

  assert.equal(login.httpStatus, 200);
  assert.equal(login.envelope.data.customerId, created.envelope.data.customerId);

  const projects = await api.handleRequest({
    method: 'GET',
    path: '/api/v1/customer/projects',
    headers: customerHeaders(created.envelope.data.customerId)
  });

  assert.equal(projects.httpStatus, 200);
  assert.equal(projects.envelope.data.projects.length >= 1, true);
  assert.equal(Array.isArray(projects.envelope.data.projects[0].timeline), true);
  assert.equal(Array.isArray(projects.envelope.data.projects[0].files), true);
  assert.equal(Array.isArray(projects.envelope.data.projects[0].invoices), true);

  const approval = await api.handleRequest({
    method: 'POST',
    path: `/api/v1/customer/project/${created.envelope.data.missionId}/approve`,
    headers: customerHeaders(created.envelope.data.customerId),
    body: {
      missionId: created.envelope.data.missionId,
      notes: 'Customer confirms final direction.'
    }
  });

  assert.equal(approval.httpStatus, 200);
  assert.equal(approval.envelope.data.currentStage, 'CUSTOMER_APPROVED_AWAITING_CEO');
  assert.equal(approval.envelope.data.executiveStatus, 'AWAITING_EXECUTIVE_REVIEW');
});

test('website business launch stack is visible in executive dashboard section', () => {
  const { manager } = createSystem();

  manager.customerPortalManager.submitWebsiteRequest({
    businessName: 'Executive Visibility Prospect',
    businessType: 'Agency',
    websiteUrl: 'https://executive-visibility.example',
    contactName: 'Riley Executive',
    email: 'riley@executive-visibility.example',
    phone: '+1-555-0911',
    targetAudience: 'Operations leads',
    businessDescription: 'Need executive visibility signals.',
    goals: ['Launch site'],
    budget: '$9,000 - $15,000',
    timeline: '6 weeks',
    desiredPages: ['home', 'services', 'contact']
  });

  const snapshot = manager.buildSnapshot();

  assert.equal(Boolean(snapshot.websiteBusinessLaunch), true);
  assert.equal(snapshot.websiteBusinessLaunch.newLeads >= 1, true);
  assert.equal(snapshot.websiteBusinessLaunch.websiteProjects >= 1, true);
  assert.equal(snapshot.websiteBusinessLaunch.customerSatisfaction.status, 'PLACEHOLDER');
});
