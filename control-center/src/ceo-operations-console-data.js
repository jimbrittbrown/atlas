function createMission({
  missionId,
  businessId,
  state,
  currentStage,
  qualityPassed = true,
  publishingStatus = 'NOT_REQUESTED',
  riskLevel = 'LOW',
  nextRequiredDecision = 'NONE',
  lessons = []
}) {
  return {
    missionId,
    state,
    runtimeContext: {
      missionId,
      businessId,
      state,
      currentStage,
      initiatedAt: '2026-07-09T00:00:00.000Z',
      riskRegister: riskLevel === 'LOW' ? [] : [{ code: `${missionId}-RISK`, severity: riskLevel }],
      artifacts: {
        qualityReview: {
          passed: qualityPassed,
          overallScore: qualityPassed ? 96 : 48
        },
        publishing: {
          publishStatus: publishingStatus
        },
        lessonsLearned: lessons
      },
      currentStage,
      nextRequiredDecision
    },
    riskLevel,
    nextRequiredDecision
  };
}

export function createDemoDashboardInput() {
  return {
    runtimeMissions: [
      createMission({
        missionId: 'M-100',
        businessId: 'SYSTEM_INTERNAL',
        state: 'SCRIPTING',
        currentStage: 'SCRIPTING',
        qualityPassed: true,
        publishingStatus: 'NOT_REQUESTED',
        riskLevel: 'LOW',
        nextRequiredDecision: 'NONE',
        lessons: [{ title: 'Deterministic internal operations remained stable.' }]
      }),
      createMission({
        missionId: 'M-101',
        businessId: 'MIDNIGHT_ARCHIVES',
        state: 'CEO_DECISION_PENDING',
        currentStage: 'CEO_DECISION_PENDING',
        qualityPassed: true,
        publishingStatus: 'NOT_REQUESTED',
        riskLevel: 'HIGH',
        nextRequiredDecision: 'CEO_APPROVAL',
        lessons: [{ title: 'CEO approval is required before external release.' }]
      }),
      createMission({
        missionId: 'M-102',
        businessId: 'MIDNIGHT_ARCHIVES',
        state: 'FAILED',
        currentStage: 'MEDIA_RENDER',
        qualityPassed: false,
        publishingStatus: 'NOT_REQUESTED',
        riskLevel: 'CRITICAL',
        nextRequiredDecision: 'EXECUTIVE_INTERVENTION',
        lessons: [{ title: 'Render failures should be surfaced in the executive queue.' }]
      })
    ],
    queuedMissions: [
      { missionId: 'Q-200', businessId: 'MIDNIGHT_ARCHIVES' }
    ],
    businessRegistry: {
      businessCount: 2,
      registeredBusinesses: ['MIDNIGHT_ARCHIVES', 'SYSTEM_INTERNAL'],
      businessHealth: {
        MIDNIGHT_ARCHIVES: 'WARNING',
        SYSTEM_INTERNAL: 'HEALTHY'
      },
      businessProfiles: [
        {
          businessId: 'MIDNIGHT_ARCHIVES',
          displayName: 'Midnight Archives',
          status: 'ACTIVE'
        },
        {
          businessId: 'SYSTEM_INTERNAL',
          displayName: 'Atlas System Internal',
          status: 'ACTIVE'
        }
      ]
    },
    providerRegistry: {
      status: 'WARNING',
      providerCount: 5,
      configuredProviders: 5,
      healthyProviders: 3,
      productionReadyProviders: 4,
      providerSummary: {
        providerCount: 5,
        configuredProviders: 5,
        healthyProviders: 3,
        productionReadyProviders: 4
      },
      providerHealth: {
        status: 'WARNING',
        issues: [{ providerId: 'YOUTUBE', issue: 'QUOTA_WARNING' }]
      },
      missingCredentials: [],
      failedProviders: [],
      quotaWarnings: [
        { providerId: 'YOUTUBE', warning: 'LOW_QUOTA' }
      ]
    },
    credentialRegistry: {
      status: 'WARNING',
      credentialCount: 8,
      configuredCredentials: 8,
      verifiedCredentials: 7,
      warningCredentials: 1,
      credentialSummary: {
        credentialCount: 8,
        configuredCredentials: 8,
        verifiedCredentials: 7,
        warningCredentials: 1
      },
      credentialHealth: {
        status: 'WARNING',
        issues: [{ credentialId: 'GOOGLE_VERTEX_API_KEY', issue: 'WARNING' }]
      },
      verificationFailures: ['GOOGLE_VERTEX_API_KEY']
    },
    assetRegistry: {
      status: 'WARNING',
      assetCount: 12,
      releaseCandidateCount: 2,
      approvedAssets: 7,
      assetsAwaitingReview: 1,
      assetIntegrityWarnings: 1,
      assetsCreatedToday: 3,
      assetSummary: {
        assetCount: 12,
        releaseCandidateCount: 2,
        approvedAssets: 7,
        assetsAwaitingReview: 1,
        assetIntegrityWarnings: 1,
        assetsCreatedToday: 3,
        assetHealth: {
          status: 'WARNING',
          issues: [{ code: 'ASSETS_AWAITING_REVIEW', assetCount: 1 }]
        },
        recentAssets: [
          { assetId: 'ASSET-101', assetType: 'VIDEO', businessId: 'MIDNIGHT_ARCHIVES', status: 'PUBLISHED' },
          { assetId: 'ASSET-102', assetType: 'RELEASE_CANDIDATE', businessId: 'MIDNIGHT_ARCHIVES', status: 'APPROVED' }
        ],
        assetGrowth: {
          totalAssets: 12,
          createdToday: 3,
          createdYesterday: 1,
          growthDelta: 2
        },
        assetStorageSummary: {
          totalAssets: 12,
          totalBytes: 7340032
        }
      },
      assetHealth: {
        status: 'WARNING',
        issues: [{ code: 'ASSETS_AWAITING_REVIEW', assetCount: 1 }]
      },
      recentAssets: [
        { assetId: 'ASSET-101', assetType: 'VIDEO', businessId: 'MIDNIGHT_ARCHIVES', status: 'PUBLISHED' },
        { assetId: 'ASSET-102', assetType: 'RELEASE_CANDIDATE', businessId: 'MIDNIGHT_ARCHIVES', status: 'APPROVED' }
      ],
      orphanAssets: [],
      failedAssets: [],
      assetGrowth: {
        totalAssets: 12,
        createdToday: 3,
        createdYesterday: 1,
        growthDelta: 2
      },
      assetStorageSummary: {
        totalAssets: 12,
        totalBytes: 7340032
      }
    },
    knowledgeRegistry: {
      updates: [
        { title: 'Retention peaked on Midnight Archives launch prep.' },
        { title: 'Executive approval gating prevented premature publishing.' }
      ],
      items: [
        { title: 'Validated learning: no-publish defaults reduce launch risk.' },
        { title: 'Candidate: expand knowledge partition after launch review.' }
      ],
      conflicts: [
        { message: 'Council review required for a new release candidate.' }
      ]
    },
    qualityIntelligence: {
      status: 'WARNING',
      alerts: [
        { severity: 'CRITICAL', message: 'Critical quality issue on mission M-102.', missionId: 'M-102' }
      ]
    },
    executiveCouncil: {
      status: 'WARNING',
      expiredWaivers: [
        { message: 'Waiver refresh is pending for review.' }
      ],
      conflicts: [
        { message: 'Council review required before publish.', severity: 'HIGH' }
      ]
    }
  };
}
