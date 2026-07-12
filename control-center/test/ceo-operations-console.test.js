import test from 'node:test';
import assert from 'node:assert/strict';
import { CEODashboardService } from '../../dashboard/ceo-dashboard-service.js';
import { CEOOperationsConsoleService } from '../src/ceo-operations-console-service.js';
import { renderConsoleDashboard } from '../src/ceo-operations-console-view.js';
import { createDemoDashboardInput } from '../src/ceo-operations-console-data.js';

test('empty dashboard renders all major sections and future actions remain disabled', () => {
  const dashboardService = new CEODashboardService();
  const snapshot = dashboardService.generateDashboardSnapshot({
    runtimeMissions: [],
    businessRegistry: {
      businessCount: 0,
      registeredBusinesses: [],
      businessHealth: {},
      businessProfiles: []
    },
    providerRegistry: {
      providerCount: 0,
      configuredProviders: 0,
      healthyProviders: 0,
      productionReadyProviders: 0
    },
    credentialRegistry: {
      credentialCount: 0,
      configuredCredentials: 0,
      verifiedCredentials: 0,
      warningCredentials: 0
    },
    assetRegistry: {
      assetCount: 0,
      releaseCandidateCount: 0,
      approvedAssets: 0,
      assetsAwaitingReview: 0,
      assetIntegrityWarnings: 0,
      assetSummary: {
        assetCount: 0,
        releaseCandidateCount: 0,
        approvedAssets: 0,
        assetsAwaitingReview: 0,
        assetIntegrityWarnings: 0,
        assetsCreatedToday: 0,
        assetHealth: { status: 'HEALTHY', issues: [] },
        recentAssets: [],
        assetGrowth: {},
        assetStorageSummary: {}
      },
      assetHealth: { status: 'HEALTHY', issues: [] },
      recentAssets: [],
      orphanAssets: [],
      failedAssets: [],
      assetGrowth: {},
      assetStorageSummary: {},
      assetsCreatedToday: 0
    },
    knowledgeRegistry: {
      updates: [],
      items: [],
      conflicts: []
    },
    qualityIntelligence: { alerts: [] },
    executiveCouncil: { expiredWaivers: [], conflicts: [] }
  });

  const html = renderConsoleDashboard(snapshot);

  assert.match(html, /data-section="executive-summary"/);
  assert.match(html, /data-section="mission-queue"/);
  assert.match(html, /data-section="business-overview"/);
  assert.match(html, /data-section="provider-status"/);
  assert.match(html, /data-section="executive-queue"/);
  assert.match(html, /data-section="knowledge-updates"/);
  assert.match(html, /data-section="operations-health"/);
  assert.match(html, /Approve Mission/);
  assert.match(html, /disabled/);
});

test('populated dashboard renders ordered executive queue and populated business rows', () => {
  const consoleService = new CEOOperationsConsoleService({ dashboardInput: createDemoDashboardInput() });
  const snapshot = consoleService.getDashboardSnapshot();
  const html = renderConsoleDashboard(snapshot);

  const criticalIndex = html.indexOf('data-priority="CRITICAL"');
  const highIndex = html.indexOf('data-priority="HIGH"');
  const mediumIndex = html.indexOf('data-priority="MEDIUM"');
  const lowIndex = html.indexOf('data-priority="LOW"');

  assert.equal(snapshot.executiveSummary.businessCount >= 2, true);
  assert.equal(snapshot.business.length >= 2, true);
  assert.equal(criticalIndex >= 0, true);
  assert.equal(criticalIndex < highIndex, true);
  assert.equal(highIndex < mediumIndex || mediumIndex === -1, true);
  assert.equal(mediumIndex < lowIndex || lowIndex === -1, true);
  assert.match(html, /Midnight Archives/);
  assert.match(html, /Atlas System Internal/);
});

test('render ordering keeps executive summary before mission queue and business overview', () => {
  const consoleService = new CEOOperationsConsoleService({ dashboardInput: createDemoDashboardInput() });
  const html = renderConsoleDashboard(consoleService.getDashboardSnapshot());

  const executiveIndex = html.indexOf('Executive Summary');
  const missionIndex = html.indexOf('Mission Queue');
  const businessIndex = html.indexOf('Business Overview');
  const providerIndex = html.indexOf('Provider Status');
  const executiveQueueIndex = html.indexOf('Executive Queue');
  const knowledgeIndex = html.indexOf('Knowledge Updates');
  const operationsIndex = html.indexOf('Operations Health');

  assert.equal(executiveIndex < missionIndex, true);
  assert.equal(missionIndex < businessIndex, true);
  assert.equal(businessIndex < providerIndex, true);
  assert.equal(providerIndex < executiveQueueIndex, true);
  assert.equal(executiveQueueIndex < knowledgeIndex, true);
  assert.equal(knowledgeIndex < operationsIndex, true);
});

test('section visibility exposes all requested dashboard sections', () => {
  const consoleService = new CEOOperationsConsoleService({ dashboardInput: createDemoDashboardInput() });
  const html = renderConsoleDashboard(consoleService.getDashboardSnapshot());

  assert.match(html, /System Health/);
  assert.match(html, /Pending CEO Decisions/);
  assert.match(html, /Publishing Readiness/);
  assert.match(html, /Critical Alerts/);
  assert.match(html, /Registered businesses/);
  assert.match(html, /Credential health/);
  assert.match(html, /Recent lessons/);
  assert.match(html, /Validated learning/);
  assert.match(html, /Knowledge candidates/);
  assert.match(html, /Overall status/);
});

test('API compatibility delegates snapshot generation to the CEO Dashboard service', () => {
  let invocationCount = 0;
  let capturedInput = null;

  const consoleService = new CEOOperationsConsoleService({
    dashboardService: {
      generateDashboardSnapshot(input) {
        invocationCount += 1;
        capturedInput = input;

        return {
          diagnostics: { snapshotTimestamp: '2026-07-09T00:00:00.000Z' },
          executiveSummary: {
            overallHealth: 'HEALTHY',
            businessCount: 0,
            activeMissionCount: 0,
            pendingCEOApprovals: 0,
            publishingReady: 0,
            criticalAlerts: 0
          },
          missions: [],
          business: [],
          providerStatus: { providerSummary: { providerCount: 0 }, quotaWarnings: [] },
          credentialStatus: { credentialSummary: { credentialCount: 0 }, verificationFailures: [] },
          executiveQueue: { items: [] },
          recentLessons: [],
          operations: { knowledgeUpdates: [] }
        };
      }
    },
    dashboardInput: { runtimeMissions: [] }
  });

  const payload = consoleService.getDashboardPayload();

  assert.equal(invocationCount, 1);
  assert.equal(typeof capturedInput, 'object');
  assert.equal(payload.snapshot.executiveSummary.overallHealth, 'HEALTHY');
  assert.equal(typeof payload.generatedAt, 'string');
});
