# Atlas Executive Operations Dashboard v1 Report

## Overall Status
- Status: PASS
- Validation checks passed: 10
- Validation checks failed: 0

## Executive Overview
```json
{
  "totalCustomers": 2,
  "totalMissions": 2,
  "activeMissions": 0,
  "queuedMissions": 0,
  "completedMissions": 0,
  "failedMissions": 0,
  "blockedMissions": 1,
  "missionsAwaitingCeoReview": 1,
  "proposalsAwaitingCeoDecision": 1,
  "currentPortfolioValue": 160,
  "averageConfidenceScore": 0.715,
  "averageRiskScore": 0.56,
  "systemHealthSummary": "ATTENTION_REQUIRED",
  "generatedTimestamp": "2026-07-11T17:27:07.359Z",
  "dataAvailability": "AVAILABLE"
}
```

## CEO Decision Center
- Total items: 3

## Mission Control View
| Mission ID | Type | State | Completion | Priority |
|---|---|---|---:|---|
| mis_e3cc7244-2665-48ee-894f-b574098921a0 | WEBSITE_BUILD | AWAITING_EXECUTIVE_REVIEW | 100% | UNSPECIFIED |

## Opportunity Portfolio
| Rank | Proposal ID | Title | Priority | Score | Decision |
|---|---|---|---|---:|---|
| 1 | prop_b052a100-5516-4a26-9911-7100f8e1d19e | Website Build Q3 | HIGH | 0.7938 | APPROVE |
| 2 | prop_68952f94-9167-4507-be3e-5b81661060f0 | Atlas Documentary Launch | HOLD | 0.5561 | REVISION_REQUIRED |

## Provider Health
```json
[
  {
    "providerName": "Framer",
    "configuredStatus": "AVAILABLE",
    "authenticationStatus": "AVAILABLE",
    "connectionStatus": "AVAILABLE",
    "readCapabilityStatus": "AVAILABLE",
    "writeCapabilityStatus": "PARTIAL",
    "lastSuccessfulCheck": "2026-07-11T17:27:07.358Z",
    "lastFailure": null,
    "warnings": [
      "Write operations remain governance-gated and disabled from dashboard."
    ],
    "blockingIssues": [],
    "capabilityLimitations": [
      "No publish/deploy from dashboard read model."
    ]
  },
  {
    "providerName": "Google",
    "configuredStatus": "NOT_CONFIGURED",
    "authenticationStatus": "NOT_CONFIGURED",
    "connectionStatus": "NOT_CONFIGURED",
    "readCapabilityStatus": "NOT_CONFIGURED",
    "writeCapabilityStatus": "NOT_CONFIGURED",
    "lastSuccessfulCheck": null,
    "lastFailure": null,
    "warnings": [
      "Provider telemetry not configured in dashboard adapter."
    ],
    "blockingIssues": [],
    "capabilityLimitations": []
  },
  {
    "providerName": "YouTube",
    "configuredStatus": "NOT_CONFIGURED",
    "authenticationStatus": "NOT_CONFIGURED",
    "connectionStatus": "NOT_CONFIGURED",
    "readCapabilityStatus": "NOT_CONFIGURED",
    "writeCapabilityStatus": "NOT_CONFIGURED",
    "lastSuccessfulCheck": null,
    "lastFailure": null,
    "warnings": [
      "Provider not configured in this environment."
    ],
    "blockingIssues": [],
    "capabilityLimitations": []
  },
  {
    "providerName": "Gemini",
    "configuredStatus": "NOT_CONFIGURED",
    "authenticationStatus": "NOT_CONFIGURED",
    "connectionStatus": "NOT_CONFIGURED",
    "readCapabilityStatus": "NOT_CONFIGURED",
    "writeCapabilityStatus": "NOT_CONFIGURED",
    "lastSuccessfulCheck": null,
    "lastFailure": null,
    "warnings": [
      "Provider telemetry not configured in dashboard adapter."
    ],
    "blockingIssues": [],
    "capabilityLimitations": []
  },
  {
    "providerName": "ElevenLabs",
    "configuredStatus": "NOT_CONFIGURED",
    "authenticationStatus": "NOT_CONFIGURED",
    "connectionStatus": "NOT_CONFIGURED",
    "readCapabilityStatus": "NOT_CONFIGURED",
    "writeCapabilityStatus": "NOT_CONFIGURED",
    "lastSuccessfulCheck": null,
    "lastFailure": null,
    "warnings": [
      "Provider telemetry not configured in dashboard adapter."
    ],
    "blockingIssues": [],
    "capabilityLimitations": []
  }
]
```

## Alerts Summary
```json
{
  "INFO": 1,
  "WARNING": 2,
  "HIGH": 2,
  "CRITICAL": 0
}
```

## Governance Confirmations
- Read-only mode: YES
- Publish operations executed: NO
- Deploy operations executed: NO
- Approval commands executed by dashboard: NO
- Destructive operations executed: NO

## Missing Data
- None

## Limitations
- Dashboard is read-only and does not execute approvals, publishing, deployment, or writes.
- Provider health uses adapter-fed telemetry and honest NOT_CONFIGURED/NOT_CONNECTED states when unavailable.
- Financial metrics represent estimated proposal value, not recognized revenue.

## Files Created (Mission)
- integration/src/executive/executive-operations-dashboard-contracts.js
- integration/src/executive/executive-overview-model.js
- integration/src/executive/ceo-decision-center-model.js
- integration/src/executive/mission-control-dashboard-view-model.js
- integration/src/executive/executive-workforce-view-model.js
- integration/src/executive/customer-pipeline-dashboard-model.js
- integration/src/executive/opportunity-portfolio-dashboard-model.js
- integration/src/executive/provider-health-dashboard-model.js
- integration/src/executive/atlas-system-health-model.js
- integration/src/executive/executive-activity-feed-model.js
- integration/src/executive/executive-alerts-model.js
- integration/src/executive/dashboard-snapshot-registry.js
- integration/src/executive/executive-operations-dashboard-response-model.js
- integration/src/executive/executive-operations-dashboard-manager.js
- integration/src/executive/executive-operations-dashboard.js
- integration/test/executive-operations-dashboard-v1.test.js
- integration/scripts/run-executive-operations-dashboard-v1.js
- integration/docs/executive-operations-dashboard-v1.md

## Files Modified (Mission)
- integration/package.json
- integration/README.md

## Remaining Limitations
- Provider health for non-Framer providers remains adapter-driven and may be NOT_CONFIGURED in environments without credentials.
- Revenue values are proposal-value estimates and are not accounting-ledger integrated.
- Some mission-level risk/confidence fields are inferred from linked proposal evaluations where direct mission telemetry is unavailable.

## Recommended Next Stage
- Implement authenticated read-only API endpoints and role-scoped access controls for dashboard snapshot retrieval.

## Recommended Executive Actions
- AUTHORIZE_CONVERSION: CONVERT_TO_MISSION_CONTROL
- APPROVE_OR_REJECT: REVISION_REQUIRED
- REVIEW_AND_DECIDE: REVIEW_PACKAGE_AND_DECIDE_NEXT_PHASE
- Resolve blocking issues and retry stage.: Blocked mission
- Review timeline and reassignment options.: Overdue mission
- Require mitigation plan before approval.: High-risk proposal
- Resolve dependency and capability blockers.: Proposal blocking issues
- Review in CEO Decision Center.: Proposal awaiting executive action
