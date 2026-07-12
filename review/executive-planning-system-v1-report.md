# Atlas Executive Planning & Mission Portfolio System v1 Report

## Overall Status
- Status: PASS
- Tests passed: 9
- Tests failed: 0

## Ranked Mission Portfolio
| Rank | Proposal ID | Title | Mission Type | Score | Priority Band | Status |
|---|---|---|---|---:|---|---|
| 1 | prop_a994aad6-3dfd-4f5f-a4eb-fbcf6049acbb | Website Growth Platform Build | WEBSITE_BUILD | 0.8484 | HIGH | CONVERTED_TO_MISSION |
| 2 | prop_56e45ef2-536d-4013-89eb-a61ce78446fa | Internal Operations Automation Upgrade | INTERNAL_OPERATIONS | 0.6627 | MEDIUM | DEFERRED |
| 3 | prop_7442c5e7-0b42-489d-9cfa-83ca1b47ea76 | Learning Academy Curriculum Expansion | LEARNING_ACADEMY | 0.6433 | HOLD | REVISION_REQUIRED |
| 4 | prop_5c7c168f-eee0-4798-baeb-6799998bbd1d | Strategic Research Expansion | RESEARCH | 0.6343 | HOLD | UNDER_REVIEW |
| 5 | prop_6198d574-2e52-4bc3-827c-c7fa6bff0375 | Documentary Launch Narrative Program | DOCUMENTARY | 0.5761 | HOLD | UNDER_REVIEW |

## Scores and Priority Bands
```json
[
  {
    "proposalId": "prop_a994aad6-3dfd-4f5f-a4eb-fbcf6049acbb",
    "scoreBreakdown": {
      "strategicAlignment": 0.7,
      "expectedBusinessValue": 0.92,
      "urgency": 0.87,
      "confidence": 0.86,
      "feasibility": 0.8239,
      "resourceAvailability": 1,
      "dependencyReadiness": 1,
      "risk": 0.7,
      "estimatedEffort": 0.6799999999999999,
      "estimatedCost": 0.915,
      "timeToValue": 0.8747
    },
    "overallScore": 0.8484,
    "priorityBand": "HIGH",
    "confidenceBand": "HIGH",
    "recommendedDecision": "APPROVE"
  },
  {
    "proposalId": "prop_56e45ef2-536d-4013-89eb-a61ce78446fa",
    "scoreBreakdown": {
      "strategicAlignment": 0.7,
      "expectedBusinessValue": 0.58,
      "urgency": 0.49,
      "confidence": 0.57,
      "feasibility": 0.5323,
      "resourceAvailability": 1,
      "dependencyReadiness": 1,
      "risk": 0.71,
      "estimatedEffort": 0.15000000000000002,
      "estimatedCost": 0.94,
      "timeToValue": 0.5018
    },
    "overallScore": 0.6627,
    "priorityBand": "MEDIUM",
    "confidenceBand": "LOW",
    "recommendedDecision": "DEFER"
  },
  {
    "proposalId": "prop_7442c5e7-0b42-489d-9cfa-83ca1b47ea76",
    "scoreBreakdown": {
      "strategicAlignment": 0.7,
      "expectedBusinessValue": 0.74,
      "urgency": 0.58,
      "confidence": 0.71,
      "feasibility": 0.7145,
      "resourceAvailability": 0,
      "dependencyReadiness": 1,
      "risk": 0.65,
      "estimatedEffort": 0.5,
      "estimatedCost": 0.89,
      "timeToValue": 0.7014
    },
    "overallScore": 0.6433,
    "priorityBand": "HOLD",
    "confidenceBand": "MEDIUM",
    "recommendedDecision": "REVISION_REQUIRED"
  },
  {
    "proposalId": "prop_5c7c168f-eee0-4798-baeb-6799998bbd1d",
    "scoreBreakdown": {
      "strategicAlignment": 0.7,
      "expectedBusinessValue": 0.67,
      "urgency": 0.76,
      "confidence": 0.68,
      "feasibility": 0.8047,
      "resourceAvailability": 0.5,
      "dependencyReadiness": 0,
      "risk": 0.55,
      "estimatedEffort": 0.5800000000000001,
      "estimatedCost": 0.9299999999999999,
      "timeToValue": 0.8609
    },
    "overallScore": 0.6343,
    "priorityBand": "HOLD",
    "confidenceBand": "MEDIUM",
    "recommendedDecision": "REVISION_REQUIRED"
  },
  {
    "proposalId": "prop_6198d574-2e52-4bc3-827c-c7fa6bff0375",
    "scoreBreakdown": {
      "strategicAlignment": 0.7,
      "expectedBusinessValue": 0.8,
      "urgency": 0.6,
      "confidence": 0.62,
      "feasibility": 0.5488,
      "resourceAvailability": 0,
      "dependencyReadiness": 1,
      "risk": 0.21999999999999997,
      "estimatedEffort": 0.35,
      "estimatedCost": 0.6799999999999999,
      "timeToValue": 0.6115
    },
    "overallScore": 0.5761,
    "priorityBand": "HOLD",
    "confidenceBand": "MEDIUM",
    "recommendedDecision": "REVISION_REQUIRED"
  }
]
```

## Resource Recommendations
```json
[
  {
    "proposalId": "prop_a994aad6-3dfd-4f5f-a4eb-fbcf6049acbb",
    "recommendedCapabilities": [
      "COMPANY_RESEARCH",
      "BRAND_PACKAGE_GENERATION"
    ],
    "recommendedResources": [
      {
        "workerId": "wrk_0e7c1f93-2ca2-424f-8f07-34ae8dbb0260",
        "workerName": "Company Research Specialist",
        "specialty": "COMPANY_RESEARCH_SPECIALIST"
      },
      {
        "workerId": "wrk_03c45cb2-4947-4b4b-9966-e06ebc52f76b",
        "workerName": "Brand Strategy Specialist",
        "specialty": "BRAND_STRATEGY_SPECIALIST"
      },
      {
        "workerId": "wrk_ab14fe11-008d-49d1-bbeb-8c1ce5894026",
        "workerName": "Messaging Specialist",
        "specialty": "MESSAGING_SPECIALIST"
      },
      {
        "workerId": "wrk_dbb6937a-572a-4d0b-9d96-3a9a49d4b5d0",
        "workerName": "Website Architect",
        "specialty": "WEBSITE_ARCHITECT"
      },
      {
        "workerId": "wrk_e5a55189-842c-46bc-a3f8-23c1a04d716d",
        "workerName": "Framer Production Specialist",
        "specialty": "FRAMER_PRODUCTION_SPECIALIST"
      }
    ],
    "availableCapabilities": [
      "COMPANY_RESEARCH",
      "BRAND_PACKAGE_GENERATION",
      "TEMPLATE_SELECTION",
      "CUSTOMIZATION_PACKAGE_GENERATION",
      "WEBSITE_PRODUCTION_CUSTOMIZATION",
      "FRAMER_BUILD_INSTRUCTION_GENERATION",
      "SANDBOX_PROJECT_UPSERT",
      "EXECUTIVE_PACKAGE_REVIEW"
    ],
    "capacityConflicts": [
      {
        "type": "CAPACITY_CONFLICT",
        "totalEffort": 274,
        "capacityBaseline": 140,
        "demandRatio": 1.9571
      }
    ],
    "estimatedStartAvailability": [
      {
        "capability": "COMPANY_RESEARCH",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.030Z"
      },
      {
        "capability": "BRAND_PACKAGE_GENERATION",
        "availableNow": 2,
        "nextAvailableEstimate": "2026-07-11T16:59:18.030Z"
      },
      {
        "capability": "TEMPLATE_SELECTION",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.030Z"
      },
      {
        "capability": "CUSTOMIZATION_PACKAGE_GENERATION",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.030Z"
      },
      {
        "capability": "WEBSITE_PRODUCTION_CUSTOMIZATION",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.030Z"
      },
      {
        "capability": "FRAMER_BUILD_INSTRUCTION_GENERATION",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.030Z"
      },
      {
        "capability": "SANDBOX_PROJECT_UPSERT",
        "availableNow": 2,
        "nextAvailableEstimate": "2026-07-11T16:59:18.030Z"
      },
      {
        "capability": "EXECUTIVE_PACKAGE_REVIEW",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.030Z"
      }
    ]
  },
  {
    "proposalId": "prop_6198d574-2e52-4bc3-827c-c7fa6bff0375",
    "recommendedCapabilities": [
      "RESEARCH",
      "MESSAGING"
    ],
    "recommendedResources": [
      {
        "workerId": "wrk_0e7c1f93-2ca2-424f-8f07-34ae8dbb0260",
        "workerName": "Company Research Specialist",
        "specialty": "COMPANY_RESEARCH_SPECIALIST"
      },
      {
        "workerId": "wrk_03c45cb2-4947-4b4b-9966-e06ebc52f76b",
        "workerName": "Brand Strategy Specialist",
        "specialty": "BRAND_STRATEGY_SPECIALIST"
      },
      {
        "workerId": "wrk_ab14fe11-008d-49d1-bbeb-8c1ce5894026",
        "workerName": "Messaging Specialist",
        "specialty": "MESSAGING_SPECIALIST"
      },
      {
        "workerId": "wrk_dbb6937a-572a-4d0b-9d96-3a9a49d4b5d0",
        "workerName": "Website Architect",
        "specialty": "WEBSITE_ARCHITECT"
      },
      {
        "workerId": "wrk_e5a55189-842c-46bc-a3f8-23c1a04d716d",
        "workerName": "Framer Production Specialist",
        "specialty": "FRAMER_PRODUCTION_SPECIALIST"
      }
    ],
    "availableCapabilities": [
      "COMPANY_RESEARCH",
      "BRAND_PACKAGE_GENERATION",
      "TEMPLATE_SELECTION",
      "CUSTOMIZATION_PACKAGE_GENERATION",
      "WEBSITE_PRODUCTION_CUSTOMIZATION",
      "FRAMER_BUILD_INSTRUCTION_GENERATION",
      "SANDBOX_PROJECT_UPSERT",
      "EXECUTIVE_PACKAGE_REVIEW"
    ],
    "capacityConflicts": [
      {
        "type": "CAPACITY_CONFLICT",
        "totalEffort": 274,
        "capacityBaseline": 140,
        "demandRatio": 1.9571
      }
    ],
    "estimatedStartAvailability": [
      {
        "capability": "COMPANY_RESEARCH",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      },
      {
        "capability": "BRAND_PACKAGE_GENERATION",
        "availableNow": 2,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      },
      {
        "capability": "TEMPLATE_SELECTION",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      },
      {
        "capability": "CUSTOMIZATION_PACKAGE_GENERATION",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      },
      {
        "capability": "WEBSITE_PRODUCTION_CUSTOMIZATION",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      },
      {
        "capability": "FRAMER_BUILD_INSTRUCTION_GENERATION",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      },
      {
        "capability": "SANDBOX_PROJECT_UPSERT",
        "availableNow": 2,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      },
      {
        "capability": "EXECUTIVE_PACKAGE_REVIEW",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      }
    ]
  },
  {
    "proposalId": "prop_7442c5e7-0b42-489d-9cfa-83ca1b47ea76",
    "recommendedCapabilities": [
      "RESEARCH",
      "QA_SPECIALIST"
    ],
    "recommendedResources": [
      {
        "workerId": "wrk_0e7c1f93-2ca2-424f-8f07-34ae8dbb0260",
        "workerName": "Company Research Specialist",
        "specialty": "COMPANY_RESEARCH_SPECIALIST"
      },
      {
        "workerId": "wrk_03c45cb2-4947-4b4b-9966-e06ebc52f76b",
        "workerName": "Brand Strategy Specialist",
        "specialty": "BRAND_STRATEGY_SPECIALIST"
      },
      {
        "workerId": "wrk_ab14fe11-008d-49d1-bbeb-8c1ce5894026",
        "workerName": "Messaging Specialist",
        "specialty": "MESSAGING_SPECIALIST"
      },
      {
        "workerId": "wrk_dbb6937a-572a-4d0b-9d96-3a9a49d4b5d0",
        "workerName": "Website Architect",
        "specialty": "WEBSITE_ARCHITECT"
      },
      {
        "workerId": "wrk_e5a55189-842c-46bc-a3f8-23c1a04d716d",
        "workerName": "Framer Production Specialist",
        "specialty": "FRAMER_PRODUCTION_SPECIALIST"
      }
    ],
    "availableCapabilities": [
      "COMPANY_RESEARCH",
      "BRAND_PACKAGE_GENERATION",
      "TEMPLATE_SELECTION",
      "CUSTOMIZATION_PACKAGE_GENERATION",
      "WEBSITE_PRODUCTION_CUSTOMIZATION",
      "FRAMER_BUILD_INSTRUCTION_GENERATION",
      "SANDBOX_PROJECT_UPSERT",
      "EXECUTIVE_PACKAGE_REVIEW"
    ],
    "capacityConflicts": [
      {
        "type": "CAPACITY_CONFLICT",
        "totalEffort": 274,
        "capacityBaseline": 140,
        "demandRatio": 1.9571
      }
    ],
    "estimatedStartAvailability": [
      {
        "capability": "COMPANY_RESEARCH",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      },
      {
        "capability": "BRAND_PACKAGE_GENERATION",
        "availableNow": 2,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      },
      {
        "capability": "TEMPLATE_SELECTION",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      },
      {
        "capability": "CUSTOMIZATION_PACKAGE_GENERATION",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      },
      {
        "capability": "WEBSITE_PRODUCTION_CUSTOMIZATION",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      },
      {
        "capability": "FRAMER_BUILD_INSTRUCTION_GENERATION",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      },
      {
        "capability": "SANDBOX_PROJECT_UPSERT",
        "availableNow": 2,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      },
      {
        "capability": "EXECUTIVE_PACKAGE_REVIEW",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      }
    ]
  },
  {
    "proposalId": "prop_5c7c168f-eee0-4798-baeb-6799998bbd1d",
    "recommendedCapabilities": [
      "COMPANY_RESEARCH",
      "RESEARCH"
    ],
    "recommendedResources": [
      {
        "workerId": "wrk_0e7c1f93-2ca2-424f-8f07-34ae8dbb0260",
        "workerName": "Company Research Specialist",
        "specialty": "COMPANY_RESEARCH_SPECIALIST"
      },
      {
        "workerId": "wrk_03c45cb2-4947-4b4b-9966-e06ebc52f76b",
        "workerName": "Brand Strategy Specialist",
        "specialty": "BRAND_STRATEGY_SPECIALIST"
      },
      {
        "workerId": "wrk_ab14fe11-008d-49d1-bbeb-8c1ce5894026",
        "workerName": "Messaging Specialist",
        "specialty": "MESSAGING_SPECIALIST"
      },
      {
        "workerId": "wrk_dbb6937a-572a-4d0b-9d96-3a9a49d4b5d0",
        "workerName": "Website Architect",
        "specialty": "WEBSITE_ARCHITECT"
      },
      {
        "workerId": "wrk_e5a55189-842c-46bc-a3f8-23c1a04d716d",
        "workerName": "Framer Production Specialist",
        "specialty": "FRAMER_PRODUCTION_SPECIALIST"
      }
    ],
    "availableCapabilities": [
      "COMPANY_RESEARCH",
      "BRAND_PACKAGE_GENERATION",
      "TEMPLATE_SELECTION",
      "CUSTOMIZATION_PACKAGE_GENERATION",
      "WEBSITE_PRODUCTION_CUSTOMIZATION",
      "FRAMER_BUILD_INSTRUCTION_GENERATION",
      "SANDBOX_PROJECT_UPSERT",
      "EXECUTIVE_PACKAGE_REVIEW"
    ],
    "capacityConflicts": [
      {
        "type": "CAPACITY_CONFLICT",
        "totalEffort": 274,
        "capacityBaseline": 140,
        "demandRatio": 1.9571
      }
    ],
    "estimatedStartAvailability": [
      {
        "capability": "COMPANY_RESEARCH",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      },
      {
        "capability": "BRAND_PACKAGE_GENERATION",
        "availableNow": 2,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      },
      {
        "capability": "TEMPLATE_SELECTION",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      },
      {
        "capability": "CUSTOMIZATION_PACKAGE_GENERATION",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      },
      {
        "capability": "WEBSITE_PRODUCTION_CUSTOMIZATION",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      },
      {
        "capability": "FRAMER_BUILD_INSTRUCTION_GENERATION",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      },
      {
        "capability": "SANDBOX_PROJECT_UPSERT",
        "availableNow": 2,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      },
      {
        "capability": "EXECUTIVE_PACKAGE_REVIEW",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      }
    ]
  },
  {
    "proposalId": "prop_56e45ef2-536d-4013-89eb-a61ce78446fa",
    "recommendedCapabilities": [
      "COMPANY_RESEARCH",
      "BRAND_PACKAGE_GENERATION"
    ],
    "recommendedResources": [
      {
        "workerId": "wrk_0e7c1f93-2ca2-424f-8f07-34ae8dbb0260",
        "workerName": "Company Research Specialist",
        "specialty": "COMPANY_RESEARCH_SPECIALIST"
      },
      {
        "workerId": "wrk_03c45cb2-4947-4b4b-9966-e06ebc52f76b",
        "workerName": "Brand Strategy Specialist",
        "specialty": "BRAND_STRATEGY_SPECIALIST"
      },
      {
        "workerId": "wrk_ab14fe11-008d-49d1-bbeb-8c1ce5894026",
        "workerName": "Messaging Specialist",
        "specialty": "MESSAGING_SPECIALIST"
      },
      {
        "workerId": "wrk_dbb6937a-572a-4d0b-9d96-3a9a49d4b5d0",
        "workerName": "Website Architect",
        "specialty": "WEBSITE_ARCHITECT"
      },
      {
        "workerId": "wrk_e5a55189-842c-46bc-a3f8-23c1a04d716d",
        "workerName": "Framer Production Specialist",
        "specialty": "FRAMER_PRODUCTION_SPECIALIST"
      }
    ],
    "availableCapabilities": [
      "COMPANY_RESEARCH",
      "BRAND_PACKAGE_GENERATION",
      "TEMPLATE_SELECTION",
      "CUSTOMIZATION_PACKAGE_GENERATION",
      "WEBSITE_PRODUCTION_CUSTOMIZATION",
      "FRAMER_BUILD_INSTRUCTION_GENERATION",
      "SANDBOX_PROJECT_UPSERT",
      "EXECUTIVE_PACKAGE_REVIEW"
    ],
    "capacityConflicts": [
      {
        "type": "CAPACITY_CONFLICT",
        "totalEffort": 274,
        "capacityBaseline": 140,
        "demandRatio": 1.9571
      }
    ],
    "estimatedStartAvailability": [
      {
        "capability": "COMPANY_RESEARCH",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      },
      {
        "capability": "BRAND_PACKAGE_GENERATION",
        "availableNow": 2,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      },
      {
        "capability": "TEMPLATE_SELECTION",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      },
      {
        "capability": "CUSTOMIZATION_PACKAGE_GENERATION",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      },
      {
        "capability": "WEBSITE_PRODUCTION_CUSTOMIZATION",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      },
      {
        "capability": "FRAMER_BUILD_INSTRUCTION_GENERATION",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      },
      {
        "capability": "SANDBOX_PROJECT_UPSERT",
        "availableNow": 2,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      },
      {
        "capability": "EXECUTIVE_PACKAGE_REVIEW",
        "availableNow": 1,
        "nextAvailableEstimate": "2026-07-11T16:59:18.032Z"
      }
    ]
  }
]
```

## Conflicts
### Resource Conflicts
- COMPANY_RESEARCH: prop_a994aad6-3dfd-4f5f-a4eb-fbcf6049acbb, prop_56e45ef2-536d-4013-89eb-a61ce78446fa, prop_5c7c168f-eee0-4798-baeb-6799998bbd1d
- BRAND_PACKAGE_GENERATION: prop_a994aad6-3dfd-4f5f-a4eb-fbcf6049acbb, prop_56e45ef2-536d-4013-89eb-a61ce78446fa
- RESEARCH: prop_7442c5e7-0b42-489d-9cfa-83ca1b47ea76, prop_5c7c168f-eee0-4798-baeb-6799998bbd1d, prop_6198d574-2e52-4bc3-827c-c7fa6bff0375

### Dependency Conflicts
- prop_5c7c168f-eee0-4798-baeb-6799998bbd1d depends on prop_missing_dependency (UNKNOWN)

## Executive Decisions
- prop_a994aad6-3dfd-4f5f-a4eb-fbcf6049acbb: APPROVE by CEO
- prop_56e45ef2-536d-4013-89eb-a61ce78446fa: DEFER by CEO
- prop_7442c5e7-0b42-489d-9cfa-83ca1b47ea76: REVISION_REQUIRED by CEO

## Mission Conversion
- Converted mission ID: mis_43922483-43d8-4e69-9a86-7e08b1d0e3e1
- Conversion route: MISSION_CONTROL_INTAKE

## Governance Confirmations
- No autonomous publishing enabled: YES
- No production deployment enabled: YES
- CEO gate preserved: YES

## Remaining Blockers
- Dependency prop_missing_dependency unresolved for proposal prop_5c7c168f-eee0-4798-baeb-6799998bbd1d

## Recommended Next Action
- Proposal is revision-required and awaiting updates.
