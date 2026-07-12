import { z } from 'zod';

export const decisionCenterResponseSchema = z.object({
  executiveReviews: z.array(z.object({
    missionId: z.string().nullable(),
    missionType: z.string(),
    customer: z.string(),
    priority: z.string(),
    confidenceScore: z.number().nullable(),
    estimatedValue: z.number().nullable(),
    recommendedAction: z.string(),
    availableDecisions: z.array(z.string()),
    actionType: z.string(),
  })),
  blockedMissions: z.array(z.object({
    missionId: z.string(),
    reasonBlocked: z.string(),
    requiredAction: z.string(),
    responsibleWorker: z.string(),
    waitingDurationHours: z.number().nullable(),
  })),
  opportunities: z.array(z.object({
    opportunity: z.string(),
    expectedValue: z.number().nullable(),
    strategicAlignment: z.number().nullable(),
    urgency: z.number().nullable(),
    confidence: z.number().nullable(),
    recommendedOrder: z.number(),
  })),
  risks: z.array(z.object({
    title: z.string(),
    detail: z.string(),
    severity: z.string(),
  })),
  decisionHistory: z.array(z.object({
    decision: z.string(),
    timestamp: z.string(),
    mission: z.string(),
    outcome: z.string(),
  })),
  dashboardHealth: z.object({
    status: z.string(),
    generatedAt: z.string(),
    source: z.string(),
    limitations: z.array(z.string()),
  }),
  governance: z.object({
    readOnly: z.boolean(),
    decisionExecutionEnabled: z.boolean(),
    missionExecutionEnabled: z.boolean(),
    publishEnabled: z.boolean(),
    deployEnabled: z.boolean(),
    destructiveActionsEnabled: z.boolean(),
  }),
  apiVersion: z.string(),
});

export type CeoDecisionCenterResponse = z.infer<typeof decisionCenterResponseSchema>;
