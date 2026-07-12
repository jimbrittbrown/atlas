const test = require('node:test');
const assert = require('node:assert/strict');

const { WebsiteProductionSystemManager } = require('../website-production-system-manager.js');
const {
  QaStatuses,
  QaCheckNames
} = require('../contracts/website-production-system-contracts.js');

test('pipeline accepts a valid production package', () => {
  const manager = new WebsiteProductionSystemManager({
    now: () => new Date('2026-07-11T12:00:00.000Z').getTime()
  });

  const result = manager.runPipeline({
    templateInput: {
      templateId: 'ROOFING_V1',
      displayName: 'Roofing v1',
      templateFamily: 'SERVICE_BUSINESS',
      industry: 'Roofing',
      status: 'APPROVED',
      activeVersion: '1.0.0',
      versions: [{
        version: '1.0.0',
        approvedAt: '2026-07-11T00:00:00.000Z',
        approvedBy: 'Executive Producer',
        releaseNotes: 'Initial approval',
        templatePath: 'templates/roofing/v1',
        requiredPages: ['home', 'services', 'contact'],
        status: 'APPROVED',
        layoutLockHash: 'layout-lock-1'
      }]
    },
    brandingInput: {
      clientId: 'CLIENT_001',
      companyName: 'Atlas Roofing Co',
      logoAsset: {
        assetId: 'logo-1',
        assetPath: 'assets/logos/client-001.png',
        overwriteApproved: false
      },
      brandColors: ['#123456', '#abcdef'],
      serviceAreas: ['Austin, TX'],
      services: ['Roof Repair', 'Roof Replacement']
    },
    customizationInput: {
      jobId: 'JOB_001',
      clientId: 'CLIENT_001',
      templateId: 'ROOFING_V1',
      templateVersion: '1.0.0',
      brandingPackageId: 'BP_001',
      preserveLayout: true,
      requestedLogoOverwrite: false,
      replacementMap: {
        companyName: 'Atlas Roofing Co'
      }
    },
    qaInput: {
      qaReportId: 'QA_001',
      jobId: 'JOB_001',
      clientId: 'CLIENT_001',
      templateId: 'ROOFING_V1',
      checks: QaCheckNames.map(name => ({
        name,
        status: QaStatuses.PASS,
        findings: []
      }))
    },
    deliveryInput: {
      deliveryId: 'DELIVERY_001',
      clientId: 'CLIENT_001',
      jobId: 'JOB_001',
      websitePackagePath: 'artifacts/websites/client-001.zip',
      qaReportPath: 'artifacts/qa/client-001-qa.json',
      launchChecklistPath: 'artifacts/checklists/client-001-launch.md',
      clientHandoffSummaryPath: 'artifacts/handoff/client-001-summary.md'
    }
  });

  assert.equal(result.accepted, true);
  assert.equal(result.deliveryResult.accepted, true);
});

test('pipeline blocks requested logo overwrite without explicit approval', () => {
  const manager = new WebsiteProductionSystemManager();

  const result = manager.runPipeline({
    templateInput: {
      templateId: 'ROOFING_V1',
      displayName: 'Roofing v1',
      activeVersion: '1.0.0',
      versions: [{
        version: '1.0.0'
      }]
    },
    brandingInput: {
      clientId: 'CLIENT_002',
      companyName: 'North Roofing',
      logoAsset: {
        assetPath: 'assets/logos/client-002.png',
        overwriteApproved: false
      },
      brandColors: ['#111111'],
      serviceAreas: ['Dallas, TX'],
      services: ['Roof Inspection']
    },
    customizationInput: {
      jobId: 'JOB_002',
      clientId: 'CLIENT_002',
      templateId: 'ROOFING_V1',
      templateVersion: '1.0.0',
      preserveLayout: true,
      requestedLogoOverwrite: true
    },
    qaInput: {
      qaReportId: 'QA_002',
      jobId: 'JOB_002',
      clientId: 'CLIENT_002',
      templateId: 'ROOFING_V1',
      checks: QaCheckNames.map(name => ({ name, status: QaStatuses.PASS }))
    },
    deliveryInput: {
      deliveryId: 'DELIVERY_002',
      clientId: 'CLIENT_002',
      jobId: 'JOB_002',
      websitePackagePath: 'artifacts/websites/client-002.zip',
      qaReportPath: 'artifacts/qa/client-002-qa.json',
      launchChecklistPath: 'artifacts/checklists/client-002-launch.md',
      clientHandoffSummaryPath: 'artifacts/handoff/client-002-summary.md'
    }
  });

  const hasLogoBlockIssue = result.blockingIssues.some(issue => issue.issue === 'LOGO_OVERWRITE_NOT_APPROVED');

  assert.equal(result.accepted, false);
  assert.equal(hasLogoBlockIssue, true);
});
