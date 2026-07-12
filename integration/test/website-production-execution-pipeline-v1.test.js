import test from 'node:test';
import assert from 'node:assert/strict';
import { WebsiteExecutiveReviewPackageGenerator } from '../src/executive/website-executive-review-package-generator.js';
import { WebsiteProductionExecutionOrchestrator } from '../src/executive/website-production-execution-orchestrator.js';

function buildContext() {
  return {
    session: {
      orchestrationId: 'orch_1'
    },
    pipelineMission: {
      missionId: 'mission_1',
      state: 'COMPLETED',
      existingBranding: {
        logo: true,
        colors: true,
        photography: ['hero-shot']
      },
      artifacts: {
        companyResearch: {
          summary: 'Research summary',
          confidence: 0.82,
          projectDetails: {
            details: {
              pageMetadata: {
                pages: [
                  { name: 'Home', slug: 'home' },
                  { name: 'Services', slug: 'services' },
                  { name: 'Contact', slug: 'contact' }
                ]
              },
              navigation: {
                redirects: [{ source: '/index', target: '/home' }]
              },
              assets: {
                assetInventory: [{ id: 'logo' }, { id: 'hero' }]
              },
              images: {
                imageInventory: [{ id: 'image-1' }]
              },
              components: {
                componentNodes: [{ id: 'cmp-nav' }, { id: 'cmp-footer' }]
              },
              styles: {
                colorStyles: [{ id: 'color-primary' }]
              },
              variables: {
                responsiveBreakpoints: ['mobile', 'desktop']
              }
            }
          }
        },
        brandPackage: {
          confidence: 0.8,
          preservedBranding: {
            logo: true,
            colors: true
          }
        },
        templateSelection: {
          confidence: 0.79
        },
        customizationPackage: {
          primaryCallToAction: 'Book now'
        }
      }
    },
    sandboxProject: {
      id: 'sandbox_1',
      name: 'Sandbox One',
      projectUrl: 'https://sandbox.example'
    },
    projectDetails: {
      details: {
        pageMetadata: {
          pages: [
            { name: 'Home', slug: 'home' },
            { name: 'Services', slug: 'services' },
            { name: 'Contact', slug: 'contact' }
          ]
        },
        navigation: {
          redirects: [{ source: '/index', target: '/home' }]
        },
        assets: {
          assetInventory: [{ id: 'logo' }, { id: 'hero' }]
        },
        images: {
          imageInventory: [{ id: 'image-1' }]
        },
        components: {
          componentNodes: [{ id: 'cmp-nav' }, { id: 'cmp-footer' }]
        },
        styles: {
          colorStyles: [{ id: 'color-primary' }]
        },
        variables: {
          responsiveBreakpoints: ['mobile', 'desktop']
        }
      }
    }
  };
}

test('website production execution orchestrator runs full stage sequence with pass qa', () => {
  const orchestrator = new WebsiteProductionExecutionOrchestrator();
  const context = buildContext();

  const result = orchestrator.execute({
    request: {
      reviewId: 'wpr_1',
      missionId: 'mission_1',
      timestamp: '2026-01-01T00:00:00.000Z'
    },
    context,
    requiredPages: ['home', 'services', 'contact'],
    reviewPackageGenerator: new WebsiteExecutiveReviewPackageGenerator(),
    workforceDirector: {
      buildDashboard() {
        return {
          currentWorkload: [
            { workers: [{ workerId: 'wrk_1', workerName: 'Worker One' }] }
          ]
        };
      }
    }
  });

  assert.equal(result.session.state, 'AWAITING_CEO_APPROVAL');
  assert.equal(result.session.stage, 'AWAIT_GOVERNANCE_APPROVAL');
  assert.equal(result.qaResult.qaStatus, 'PASS');
  assert.equal(result.deliveryPackage.qaReport.qualityScore >= 70, true);
  assert.equal(result.deliveryPackage.deploymentInstructions.publishAllowed, false);
  assert.equal(result.deliveryPackage.deploymentInstructions.deployAllowed, false);
  assert.equal(result.deliveryPackage.deploymentInstructions.destructiveOperationsAllowed, false);
});

test('website production execution orchestrator captures revisions when qa fails', () => {
  const orchestrator = new WebsiteProductionExecutionOrchestrator();
  const context = buildContext();

  context.projectDetails.details.pageMetadata.pages = [{ name: 'Home', slug: 'home' }];
  context.projectDetails.details.navigation.redirects = [];
  context.projectDetails.details.assets.assetInventory = [];
  context.projectDetails.details.images.imageInventory = [];
  context.projectDetails.details.styles.colorStyles = [];
  context.projectDetails.details.variables = {};
  context.projectDetails.details.components.componentNodes = [{ id: 'cmp-nav', status: 'broken' }];
  context.pipelineMission.artifacts.brandPackage.preservedBranding = {};

  const result = orchestrator.execute({
    request: {
      reviewId: 'wpr_2',
      missionId: 'mission_2',
      timestamp: '2026-01-01T00:00:00.000Z'
    },
    context,
    requiredPages: ['home', 'services', 'contact'],
    reviewPackageGenerator: new WebsiteExecutiveReviewPackageGenerator(),
    workforceDirector: {
      buildDashboard() {
        return {
          currentWorkload: [
            { workers: [{ workerId: 'wrk_2', workerName: 'Worker Two' }] }
          ]
        };
      }
    }
  });

  assert.equal(result.qaResult.qaStatus, 'REVISION_REQUIRED');
  assert.equal(result.revisionHistory.length >= 1, true);
  assert.equal(result.session.revisionRetries >= 1, true);
  assert.equal(result.session.deliveryReadiness, 'REVISIONS_PENDING_CEO_DECISION');
});
