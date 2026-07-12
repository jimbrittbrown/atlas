import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { MissionPortfolioManager } from '../src/executive/mission-portfolio-manager.js';
import { MissionPortfolioRegistry } from '../src/executive/mission-portfolio-registry.js';
import { ExecutivePlanningEngine } from '../src/executive/executive-planning-engine.js';
import { MissionConversionBridge } from '../src/executive/mission-conversion-bridge.js';
import { MissionRegistry } from '../src/executive/mission-registry.js';
import { WorkforceDirector } from '../src/executive/workforce-director.js';
import {
  CommercialAcceptanceStates,
  CommercialPackageTypes,
  moneyMinorToMajorUnits,
  ExecutiveDecisions,
  PlanningRecommendedDecisions,
  ProposalStatuses
} from '../src/executive/executive-planning-contracts.js';

function buildProposal(overrides = {}) {
  return {
    sourceType: 'CUSTOMER',
    sourceId: 'src-customer-1',
    customerId: 'cus-001',
    title: 'Launch Atlas Website Build',
    description: 'Create conversion-focused website using existing brand assets.',
    missionType: 'WEBSITE_BUILD',
    requestedOutcome: 'Increase inbound qualified leads.',
    strategicObjective: 'Grow customer acquisition pipeline.',
    expectedBusinessValue: 85,
    urgency: 80,
    estimatedEffort: 30,
    estimatedCost: 50000,
    estimatedDuration: 30,
    dependencies: [],
    requiredCapabilities: ['COMPANY_RESEARCH', 'BRAND_PACKAGE_GENERATION'],
    risks: [{ id: 'r1', severity: 0.2 }],
    confidence: 0.82,
    metadata: {
      companyName: 'North Ridge HVAC',
      contactName: 'Morgan Lee',
      contactEmail: 'morgan@northridge.example',
      contactPhone: '+1-303-555-0199',
      website: 'https://northridge.example',
      industry: 'Home Services',
      adapterType: 'FRAMER',
      providerHint: 'FRAMER_SANDBOX'
    },
    ...overrides
  };
}

function createFakeMissionControl() {
  const missionRegistry = new MissionRegistry();
  const workforceDirector = new WorkforceDirector();
  const intakeCalls = [];

  return {
    missionRegistry,
    workforceDirector,
    intakeCalls,
    async intake(payload = {}) {
      intakeCalls.push(payload);
      const mission = missionRegistry.createMission({
        customerId: payload.customerId ?? 'customer-from-intake',
        missionType: payload.missionType,
        assignedWorkforce: ['WEBSITE_DIVISION'],
        currentStage: 'MISSION_CREATED',
        progress: 5,
        executiveStatus: 'ACTIVE'
      });

      const updated = missionRegistry.updateMission(mission.missionId, {
        lineage: payload.lineage ?? {},
        currentStage: 'SANDBOX_PROJECT_UPSERT',
        progress: 100,
        executiveStatus: 'AWAITING_EXECUTIVE_REVIEW'
      });

      return {
        accepted: true,
        mission: updated,
        downstreamResult: {
          mission: {
            missionId: updated.missionId,
            state: 'COMPLETED',
            currentStageId: updated.currentStage
          },
          progress: {
            completionPercentage: 100
          }
        }
      };
    }
  };
}

function createSystem() {
  const missionControl = createFakeMissionControl();

  const portfolioRegistry = new MissionPortfolioRegistry();
  const planningEngine = new ExecutivePlanningEngine();
  const conversionBridge = new MissionConversionBridge({
    missionControl,
    missionRegistry: missionControl.missionRegistry
  });

  const portfolioManager = new MissionPortfolioManager({
    missionControl,
    workforceDirector: missionControl.workforceDirector,
    portfolioRegistry,
    planningEngine,
    conversionBridge
  });

  return {
    missionControl,
    system: new ExecutivePlanningSystem({
      missionControl,
      portfolioManager
    })
  };
}

test('valid proposal creation and intake acceptance', () => {
  const { system } = createSystem();
  const result = system.submitProposal(buildProposal());

  assert.equal(result.accepted, true);
  assert.equal(result.proposal.status, ProposalStatuses.UNDER_REVIEW);
  assert.equal(typeof result.proposal.proposalId, 'string');
});

test('required-field rejection', () => {
  const { system } = createSystem();
  const result = system.submitProposal(buildProposal({ title: '' }));

  assert.equal(result.accepted, false);
  assert.equal(result.reason.includes('title is required.'), true);
});

test('duplicate proposal detection', () => {
  const { system } = createSystem();
  const payload = buildProposal();

  const first = system.submitProposal(payload);
  const second = system.submitProposal(payload);

  assert.equal(first.accepted, true);
  assert.equal(second.accepted, false);
  assert.equal(second.duplicateDetected, true);
});

test('deterministic scoring', () => {
  const { system } = createSystem();
  const submit = system.submitProposal(buildProposal());

  const first = system.portfolioManager.evaluateProposal(submit.proposal.proposalId);
  const second = system.portfolioManager.evaluateProposal(submit.proposal.proposalId);

  assert.equal(first.evaluation.overallScore, second.evaluation.overallScore);
  assert.deepEqual(first.evaluation.scoreBreakdown, second.evaluation.scoreBreakdown);
});

test('priority ranking', () => {
  const { system } = createSystem();

  const high = system.submitProposal(buildProposal({
    title: 'High Value Strategy',
    expectedBusinessValue: 95,
    urgency: 90,
    confidence: 0.9
  }));

  const low = system.submitProposal(buildProposal({
    sourceId: 'src-customer-2',
    title: 'Low Value Cleanup',
    expectedBusinessValue: 30,
    urgency: 20,
    confidence: 0.4,
    estimatedEffort: 80,
    estimatedCost: 200000
  }));

  system.portfolioManager.evaluateProposal(high.proposal.proposalId);
  system.portfolioManager.evaluateProposal(low.proposal.proposalId);

  const ranked = system.rankPortfolio();

  assert.equal(ranked.ranked.length >= 2, true);
  assert.equal(ranked.ranked[0].proposal.proposalId, high.proposal.proposalId);
});

test('resource conflict detection', () => {
  const { system } = createSystem();

  const one = system.submitProposal(buildProposal({ title: 'Resource Conflict 1' }));
  const two = system.submitProposal(buildProposal({
    sourceId: 'src-customer-3',
    title: 'Resource Conflict 2',
    requiredCapabilities: ['COMPANY_RESEARCH', 'BRAND_PACKAGE_GENERATION']
  }));

  system.portfolioManager.evaluateProposal(one.proposal.proposalId);
  system.portfolioManager.evaluateProposal(two.proposal.proposalId);

  const ranked = system.rankPortfolio();
  assert.equal(ranked.resourceConflicts.length > 0, true);
});

test('dependency conflict detection', () => {
  const { system } = createSystem();

  const proposal = system.submitProposal(buildProposal({
    title: 'Dependency Proposal',
    dependencies: ['prop_unknown_dependency']
  }));

  system.portfolioManager.evaluateProposal(proposal.proposal.proposalId);
  const ranked = system.rankPortfolio();

  assert.equal(ranked.dependencyConflicts.length > 0, true);
});

test('CEO approval requirement is enforced for high-cost missions', () => {
  const { system } = createSystem();

  const submitted = system.submitProposal(buildProposal({
    title: 'High Cost Mission',
    estimatedCost: 500000
  }));

  system.portfolioManager.evaluateProposal(submitted.proposal.proposalId);

  const blocked = system.applyDecision({
    proposalId: submitted.proposal.proposalId,
    decision: ExecutiveDecisions.APPROVE,
    decidedBy: 'VP_OPERATIONS',
    rationale: 'Proceed quickly',
    conditions: []
  });

  assert.equal(blocked.applied, false);
  assert.equal(blocked.reason.includes('CEO approval required'), true);
});

test('approval with conditions supported', () => {
  const { system } = createSystem();

  const submitted = system.submitProposal(buildProposal({
    title: 'Conditional Approval Mission',
    expectedBusinessValue: 88
  }));
  system.portfolioManager.evaluateProposal(submitted.proposal.proposalId);

  const decision = system.applyDecision({
    proposalId: submitted.proposal.proposalId,
    decision: ExecutiveDecisions.APPROVE_WITH_CONDITIONS,
    decidedBy: 'CEO',
    rationale: 'Approved with QA checkpoint before conversion',
    conditions: ['QA checkpoint', 'Budget lock']
  });

  assert.equal(decision.applied, true);
  assert.equal(decision.proposal.status, ProposalStatuses.APPROVED);
});

test('deferred proposal decision', () => {
  const { system } = createSystem();

  const submitted = system.submitProposal(buildProposal({ title: 'Deferred Proposal' }));
  system.portfolioManager.evaluateProposal(submitted.proposal.proposalId);

  const decision = system.applyDecision({
    proposalId: submitted.proposal.proposalId,
    decision: ExecutiveDecisions.DEFER,
    decidedBy: 'CEO',
    rationale: 'Shift to next quarter planning cycle',
    conditions: []
  });

  assert.equal(decision.applied, true);
  assert.equal(decision.proposal.status, ProposalStatuses.DEFERRED);
});

test('rejected proposal decision', () => {
  const { system } = createSystem();

  const submitted = system.submitProposal(buildProposal({
    title: 'Rejected Proposal',
    expectedBusinessValue: 10,
    confidence: 0.2,
    urgency: 5
  }));
  system.portfolioManager.evaluateProposal(submitted.proposal.proposalId);

  const decision = system.applyDecision({
    proposalId: submitted.proposal.proposalId,
    decision: ExecutiveDecisions.REJECT,
    decidedBy: 'CEO',
    rationale: 'Insufficient strategic return',
    conditions: []
  });

  assert.equal(decision.applied, true);
  assert.equal(decision.proposal.status, ProposalStatuses.REJECTED);
});

test('approved proposal conversion and Mission Control integration', async () => {
  const { system, missionControl } = createSystem();

  const submitted = system.submitProposal(buildProposal({ title: 'Convert To Mission' }));
  system.portfolioManager.evaluateProposal(submitted.proposal.proposalId);

  system.applyDecision({
    proposalId: submitted.proposal.proposalId,
    decision: ExecutiveDecisions.APPROVE,
    decidedBy: 'CEO',
    rationale: 'Approved for immediate conversion',
    conditions: []
  });

  const conversion = await system.convertApprovedProposal(submitted.proposal.proposalId);

  assert.equal(conversion.converted, true);
  assert.equal(typeof conversion.missionId, 'string');
  assert.equal(missionControl.intakeCalls.length, 1);

  const proposal = system.portfolioManager.portfolioRegistry.getProposal(submitted.proposal.proposalId).proposal;
  assert.equal(proposal.status, ProposalStatuses.CONVERTED_TO_MISSION);
  assert.equal(proposal.linkedMissionId, conversion.missionId);
});

test('duplicate conversion prevention is idempotent', async () => {
  const { system } = createSystem();

  const submitted = system.submitProposal(buildProposal({ title: 'Idempotent Conversion' }));
  system.portfolioManager.evaluateProposal(submitted.proposal.proposalId);

  system.applyDecision({
    proposalId: submitted.proposal.proposalId,
    decision: ExecutiveDecisions.APPROVE,
    decidedBy: 'CEO',
    rationale: 'Approved',
    conditions: []
  });

  const first = await system.convertApprovedProposal(submitted.proposal.proposalId);
  const second = await system.convertApprovedProposal(submitted.proposal.proposalId);

  assert.equal(first.converted, true);
  assert.equal(second.converted, false);
  assert.equal(second.blocked, true);
});

test('workforce director integration provides availability and utilization context', () => {
  const { system } = createSystem();

  const submitted = system.submitProposal(buildProposal({ title: 'Workforce Context Proposal' }));
  const evaluationResult = system.portfolioManager.evaluateProposal(submitted.proposal.proposalId);

  assert.equal(Array.isArray(evaluationResult.context.availableCapabilities), true);
  assert.equal(Array.isArray(evaluationResult.context.workforceSnapshot.workers), true);
  assert.equal(typeof evaluationResult.context.workforceSnapshot.dashboard.workerUtilization, 'number');
});

test('dashboard metrics projection', () => {
  const { system } = createSystem();

  const one = system.submitProposal(buildProposal({ title: 'Dashboard One' }));
  const two = system.submitProposal(buildProposal({
    sourceId: 'src-customer-77',
    title: 'Dashboard Two',
    missionType: 'DOCUMENTARY',
    requiredCapabilities: ['RESEARCH']
  }));

  system.portfolioManager.evaluateProposal(one.proposal.proposalId);
  system.portfolioManager.evaluateProposal(two.proposal.proposalId);

  system.applyDecision({
    proposalId: one.proposal.proposalId,
    decision: ExecutiveDecisions.DEFER,
    decidedBy: 'CEO',
    rationale: 'Delay for budget review',
    conditions: []
  });

  const dashboard = system.buildDashboard();

  assert.equal(dashboard.totalProposals >= 2, true);
  assert.equal(typeof dashboard.portfolioValueEstimate, 'number');
  assert.equal(Array.isArray(dashboard.topPriorityProposals), true);
  assert.equal(Array.isArray(dashboard.recommendedNextExecutiveActions), true);
});

test('recovery operations: resume, retry evaluation, rollback, cancel', () => {
  const { system } = createSystem();

  const submitted = system.submitProposal(buildProposal({ title: 'Recovery Proposal' }));
  const proposalId = submitted.proposal.proposalId;

  const revisionDecision = system.applyDecision({
    proposalId,
    decision: ExecutiveDecisions.REVISION_REQUIRED,
    decidedBy: 'CEO',
    rationale: 'Need stronger ROI assumptions',
    conditions: []
  });

  assert.equal(revisionDecision.applied, true);
  assert.equal(revisionDecision.proposal.status, ProposalStatuses.REVISION_REQUIRED);

  const resumed = system.portfolioManager.resumeReview(proposalId);
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.proposal.status, ProposalStatuses.UNDER_REVIEW);

  const retry = system.portfolioManager.retryEvaluation(proposalId);
  assert.equal(retry.retried, true);

  const rollback = system.portfolioManager.rollbackProposalStatus({
    proposalId,
    toStatus: ProposalStatuses.REVISION_REQUIRED,
    reason: 'Manual rollback for validation'
  });
  assert.equal(rollback.rolledBack, true);

  const cancel = system.portfolioManager.cancelProposal({
    proposalId,
    decidedBy: 'CEO',
    rationale: 'Cancelled after strategic reprioritization'
  });
  assert.equal(cancel.applied, true);
  assert.equal(cancel.proposal.status, ProposalStatuses.CANCELLED);
});

test('governance protection blocks conversion when not approved', async () => {
  const { system } = createSystem();

  const submitted = system.submitProposal(buildProposal({ title: 'Governance Block Conversion' }));
  system.portfolioManager.evaluateProposal(submitted.proposal.proposalId);

  system.applyDecision({
    proposalId: submitted.proposal.proposalId,
    decision: ExecutiveDecisions.DEFER,
    decidedBy: 'CEO',
    rationale: 'Not yet approved',
    conditions: []
  });

  const conversion = await system.convertApprovedProposal(submitted.proposal.proposalId);

  assert.equal(conversion.converted, false);
  assert.equal(conversion.blocked, true);
  assert.equal(conversion.reason.includes('APPROVE'), true);
});

test('engine exposes approved decision recommendation path', () => {
  const { system } = createSystem();

  const submitted = system.submitProposal(buildProposal({
    title: 'Recommendation Path',
    expectedBusinessValue: 99,
    urgency: 95,
    confidence: 0.95,
    estimatedEffort: 10,
    estimatedCost: 15000,
    estimatedDuration: 10
  }));

  const result = system.portfolioManager.evaluateProposal(submitted.proposal.proposalId);
  assert.equal(
    [
      PlanningRecommendedDecisions.APPROVE,
      PlanningRecommendedDecisions.APPROVE_WITH_CONDITIONS,
      PlanningRecommendedDecisions.DEFER,
      PlanningRecommendedDecisions.REVISION_REQUIRED,
      PlanningRecommendedDecisions.REJECT
    ].includes(result.evaluation.recommendedDecision),
    true
  );
});

test('WS-1 canonical commercial packages include launch and website care', () => {
  const { system } = createSystem();
  const packages = system.listCommercialPackages();
  const launch = packages.find((item) => item.packageType === CommercialPackageTypes.LAUNCH_PACKAGE);
  const care = packages.find((item) => item.packageType === CommercialPackageTypes.WEBSITE_CARE);

  assert.equal(Array.isArray(packages), true);
  assert.equal(Boolean(launch), true);
  assert.equal(Boolean(care), true);
  assert.equal(launch.defaultPriceMoney.amountMinor, 250000);
  assert.equal(launch.defaultPriceMoney.currency, 'USD');
  assert.equal(care.defaultPriceMoney.amountMinor, 39500);
  assert.equal(care.defaultPriceMoney.currency, 'USD');
  assert.equal(moneyMinorToMajorUnits(launch.defaultPriceMoney.amountMinor), 2500);
  assert.equal(moneyMinorToMajorUnits(care.defaultPriceMoney.amountMinor), 395);
});

test('WS-1 submission generates initial commercial proposal artifact with expiration', () => {
  const { system } = createSystem();
  const submit = system.submitProposal(buildProposal());

  assert.equal(submit.accepted, true);
  const commercial = submit.proposal.commercial;
  assert.equal(typeof commercial.expiresAt, 'string');
  assert.equal(Array.isArray(commercial.versions), true);
  assert.equal(commercial.versions.length, 1);
  assert.equal(commercial.activeVersionNumber, 1);

  const launchItem = commercial.versions[0].lineItems.find((item) => item.packageType === CommercialPackageTypes.LAUNCH_PACKAGE);
  assert.equal(Boolean(launchItem), true);
  assert.equal(launchItem.unitPriceMoney.amountMinor, 250000);
  assert.equal(launchItem.unitPriceMoney.currency, 'USD');
  assert.equal(launchItem.totalPriceMoney.amountMinor, 250000);
  assert.equal(commercial.versions[0].pricing.totalMoney.amountMinor, 250000);
  assert.equal(commercial.versions[0].pricing.totalMoney.currency, 'USD');
});

test('WS-1 supports commercial proposal versioning', () => {
  const { system } = createSystem();
  const submit = system.submitProposal(buildProposal());

  const result = system.generateCommercialProposalArtifact({
    proposalId: submit.proposal.proposalId,
    createdBy: 'commercial_director',
    lineItems: [
      { packageType: CommercialPackageTypes.LAUNCH_PACKAGE, quantity: 1 },
      { packageType: CommercialPackageTypes.WEBSITE_CARE, quantity: 1 }
    ],
    notes: 'v2 artifact'
  });

  assert.equal(result.accepted, true);
  assert.equal(result.version.versionNumber, 2);
  assert.equal(result.proposal.commercial.activeVersionNumber, 2);
  assert.equal(result.proposal.commercial.versions.length, 2);
  assert.equal(result.version.pricing.totalMoney.amountMinor, 289500);
  assert.equal(result.version.pricing.totalMoney.currency, 'USD');
});

test('WS-1 controlled price override creates audited version', () => {
  const { system } = createSystem();
  const submit = system.submitProposal(buildProposal());

  const override = system.applyCommercialPriceOverride({
    proposalId: submit.proposal.proposalId,
    actor: 'commercial_director',
    reason: 'Pilot customer launch discount',
    totalMoney: {
      amountMinor: 240000,
      currency: 'USD'
    }
  });

  assert.equal(override.accepted, true);
  assert.equal(override.override.newMoney.amountMinor, 240000);
  assert.equal(override.override.newMoney.currency, 'USD');
  assert.equal(override.proposal.commercial.overrideHistory.length, 1);
  assert.equal(override.proposal.commercial.activeVersionNumber, 2);
  assert.equal(override.proposal.commercial.versions[1].pricing.totalMoney.amountMinor, 240000);
  assert.equal(
    override.proposal.auditTrail.some((entry) => entry.type === 'COMMERCIAL_PRICE_OVERRIDE'),
    true
  );
});

test('WS-1 rejects ambiguous and unsafe override money values', () => {
  const { system } = createSystem();
  const submit = system.submitProposal(buildProposal());

  const fractional = system.applyCommercialPriceOverride({
    proposalId: submit.proposal.proposalId,
    actor: 'commercial_director',
    reason: 'invalid fractional',
    totalMoney: {
      amountMinor: 12.5,
      currency: 'USD'
    }
  });
  const negative = system.applyCommercialPriceOverride({
    proposalId: submit.proposal.proposalId,
    actor: 'commercial_director',
    reason: 'invalid negative',
    totalMoney: {
      amountMinor: -1,
      currency: 'USD'
    }
  });
  const unsupportedCurrency = system.applyCommercialPriceOverride({
    proposalId: submit.proposal.proposalId,
    actor: 'commercial_director',
    reason: 'invalid currency',
    totalMoney: {
      amountMinor: 200000,
      currency: 'EUR'
    }
  });

  assert.equal(fractional.accepted, false);
  assert.equal(fractional.reason.includes('integer minor-unit'), true);
  assert.equal(negative.accepted, false);
  assert.equal(negative.reason.includes('positive'), true);
  assert.equal(unsupportedCurrency.accepted, false);
  assert.equal(unsupportedCurrency.reason.includes('unsupported'), true);
});

test('WS-1 commercial acceptance creates customer-project linked acceptance record and quote lock', () => {
  const { system } = createSystem();
  const submit = system.submitProposal(buildProposal());

  const accepted = system.acceptCommercialProposal({
    proposalId: submit.proposal.proposalId,
    customerId: 'cus-001',
    projectId: 'mission-001',
    acceptedBy: 'Morgan Lee',
    termsVersion: 'ATLAS_WEBSITE_TERMS_V1'
  });

  assert.equal(accepted.accepted, true);
  assert.equal(accepted.proposal.commercial.acceptance.state, CommercialAcceptanceStates.ACCEPTED);
  assert.equal(accepted.acceptanceRecord.customerId, 'cus-001');
  assert.equal(accepted.acceptanceRecord.projectId, 'mission-001');
  assert.equal(accepted.proposal.commercial.priceLock.locked, true);
  assert.equal(accepted.acceptanceRecord.lockedQuote.amountMinor, 250000);
  assert.equal(accepted.acceptanceRecord.lockedQuote.currency, 'USD');
  assert.equal(typeof accepted.acceptanceRecord.lockedQuote.lineItemIntegrityHash, 'string');
  assert.equal(accepted.proposal.commercial.priceLock.lockRecord.amountMinor, 250000);
  assert.equal(accepted.proposal.commercial.priceLock.lockRecord.currency, 'USD');
  assert.equal(accepted.proposal.commercial.priceLock.lockRecord.proposalVersion, 1);
  assert.equal(accepted.proposal.commercial.priceLock.lockRecord.actor, 'Morgan Lee');
  assert.equal(accepted.proposal.commercial.priceLock.lockRecord.reason, 'CUSTOMER_ACCEPTANCE');
});

test('WS-1 blocks price override and artifact versioning after quote lock', () => {
  const { system } = createSystem();
  const submit = system.submitProposal(buildProposal());

  const accepted = system.acceptCommercialProposal({
    proposalId: submit.proposal.proposalId,
    customerId: 'cus-001',
    projectId: 'mission-001',
    acceptedBy: 'Morgan Lee',
    termsVersion: 'ATLAS_WEBSITE_TERMS_V1'
  });
  assert.equal(accepted.accepted, true);

  const blockedOverride = system.applyCommercialPriceOverride({
    proposalId: submit.proposal.proposalId,
    actor: 'commercial_director',
    reason: 'Attempt post-lock change',
    totalMoney: {
      amountMinor: 200000,
      currency: 'USD'
    }
  });
  const blockedVersion = system.generateCommercialProposalArtifact({
    proposalId: submit.proposal.proposalId,
    createdBy: 'commercial_director',
    lineItems: [{ packageType: CommercialPackageTypes.LAUNCH_PACKAGE, quantity: 1 }]
  });

  assert.equal(blockedOverride.accepted, false);
  assert.equal(blockedOverride.reason.includes('locked'), true);
  assert.equal(blockedVersion.accepted, false);
  assert.equal(blockedVersion.reason.includes('locked'), true);
});

test('WS-1 rejects mismatched currency on artifact generation', () => {
  const { system } = createSystem();
  const submit = system.submitProposal(buildProposal());

  const result = system.generateCommercialProposalArtifact({
    proposalId: submit.proposal.proposalId,
    createdBy: 'commercial_director',
    lineItems: [
      {
        packageType: CommercialPackageTypes.LAUNCH_PACKAGE,
        quantity: 1,
        unitPriceMoney: {
          amountMinor: 250000,
          currency: 'EUR'
        }
      }
    ]
  });

  assert.equal(result.accepted, false);
  assert.equal(result.reason.includes('currency'), true);
});

test('WS-1 proposal expiration prevents acceptance and marks commercial state expired', () => {
  const { system } = createSystem();
  const submit = system.submitProposal(buildProposal({
    commercial: {
      expiresAt: '2000-01-01T00:00:00.000Z'
    }
  }));

  const expired = system.expireCommercialProposal(submit.proposal.proposalId, {
    nowMs: Date.parse('2001-01-01T00:00:00.000Z')
  });
  assert.equal(expired.expired, true);

  const acceptance = system.acceptCommercialProposal({
    proposalId: submit.proposal.proposalId,
    customerId: 'cus-001',
    projectId: 'mission-001',
    acceptedBy: 'Morgan Lee',
    termsVersion: 'ATLAS_WEBSITE_TERMS_V1'
  });

  assert.equal(acceptance.accepted, false);
  assert.equal(acceptance.reason.includes('expired'), true);
  assert.equal(acceptance.proposal.commercial.acceptance.state, CommercialAcceptanceStates.EXPIRED);
});

test('WS-1 dollar display conversion remains correct from minor units', () => {
  assert.equal(moneyMinorToMajorUnits(250000), 2500);
  assert.equal(moneyMinorToMajorUnits(39500), 395);
  assert.equal(moneyMinorToMajorUnits(240000), 2400);
});
