import { z } from 'zod';
import type { ApiEnvelope, DashboardSnapshot } from './types';

const freshnessSchema = z.object({
  section: z.string(),
  status: z.string(),
  checkedAt: z.string(),
  notes: z.array(z.string()).optional(),
});

const snapshotSchema = z.object({
  executiveOverview: z.object({
    totalCustomers: z.number(),
    totalMissions: z.number(),
    activeMissions: z.number(),
    blockedMissions: z.number(),
    missionsAwaitingCeoReview: z.number(),
    currentPortfolioValue: z.number(),
    averageConfidenceScore: z.number().nullable(),
    averageRiskScore: z.number().nullable(),
    systemHealthSummary: z.string(),
    dataAvailability: z.string(),
    generatedTimestamp: z.string(),
  }),
  missionControl: z.object({
    records: z.array(z.object({
      missionId: z.string(),
      customer: z.string(),
      currentState: z.string(),
      blockingIssues: z.array(z.string()).default([]),
      ceoReviewStatus: z.string(),
    })).default([]),
  }),
  workforce: z.object({
    utilization: z.number().nullable(),
    status: z.string(),
    workerDetails: z.array(z.object({ workerId: z.string(), status: z.string() })).optional(),
  }),
  customerPipeline: z.object({ status: z.string(), totalCustomers: z.number().default(0) }),
  opportunityPortfolio: z.object({
    status: z.string(),
    estimatedPortfolioValue: z.number().optional(),
    rows: z.array(z.object({ proposalId: z.string().optional() })).optional(),
  }),
  websiteBusinessLaunch: z.object({
    status: z.string(),
    newLeads: z.number(),
    activeCustomers: z.number(),
    websiteProjects: z.number(),
    revenuePipelineEstimated: z.number(),
    projectsAwaitingApproval: z.number(),
    revisionQueue: z.number(),
    customerSatisfaction: z.object({
      status: z.string(),
      score: z.number().nullable(),
      note: z.string(),
    }),
  }).optional(),
  providerHealth: z.object({
    status: z.string(),
    providers: z.array(z.object({
      providerName: z.string(),
      configuredStatus: z.string(),
      connectionStatus: z.string(),
      readCapabilityStatus: z.string(),
      writeCapabilityStatus: z.string(),
      warnings: z.array(z.string()).default([]),
    })),
  }),
  systemHealth: z.object({ status: z.string(), summary: z.string().default('UNKNOWN') }),
  alerts: z.object({
    alerts: z.array(z.object({
      alertId: z.string(),
      severity: z.string(),
      title: z.string(),
      category: z.string(),
      recommendedAction: z.string().nullable().optional(),
    })).default([]),
  }),
  activityFeed: z.object({
    events: z.array(z.object({
      eventId: z.string(),
      timestamp: z.string(),
      severity: z.string(),
      title: z.string(),
      description: z.string(),
      sourceSystem: z.string(),
    })).default([]),
  }),
  generatedAt: z.string(),
  dataFreshness: z.array(freshnessSchema),
  missingData: z.array(z.string()),
  limitations: z.array(z.string()),
  recommendedExecutiveActions: z.array(z.object({
    action: z.string(),
    reason: z.string(),
    decisionId: z.string().optional(),
    alertId: z.string().optional(),
  })),
  dashboardStatus: z.string(),
});

const envelopeSchema = z.object({
  success: z.boolean(),
  status: z.number(),
  requestId: z.string(),
  timestamp: z.string(),
  data: snapshotSchema,
  pagination: z.null(),
  dataFreshness: z.array(freshnessSchema).nullable(),
  warnings: z.array(z.string()),
  limitations: z.array(z.string()),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }).nullable(),
});

export function parseDashboardEnvelope(input: unknown): ApiEnvelope<DashboardSnapshot> {
  return envelopeSchema.parse(input) as ApiEnvelope<DashboardSnapshot>;
}
