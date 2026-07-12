export type DataAvailabilityStatus =
  | 'AVAILABLE'
  | 'PARTIAL'
  | 'UNAVAILABLE'
  | 'NOT_CONNECTED'
  | 'NOT_CONFIGURED'
  | 'ESTIMATED';

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_REQUEST'
  | 'RATE_LIMITED'
  | 'DATA_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export type ApiEnvelope<T> = {
  success: boolean;
  status: number;
  requestId: string;
  timestamp: string;
  data: T;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    maxPageSizeEnforced?: boolean;
  } | null;
  dataFreshness: Array<{ section: string; status: DataAvailabilityStatus; checkedAt: string; notes?: string[] }> | null;
  warnings: string[];
  limitations: string[];
  error: { code: ApiErrorCode; message: string; details?: unknown } | null;
};

export type DashboardSnapshot = {
  executiveOverview: {
    totalCustomers: number;
    totalMissions: number;
    activeMissions: number;
    blockedMissions: number;
    missionsAwaitingCeoReview: number;
    currentPortfolioValue: number;
    averageConfidenceScore: number | null;
    averageRiskScore: number | null;
    systemHealthSummary: string;
    dataAvailability: DataAvailabilityStatus;
    generatedTimestamp: string;
  };
  missionControl: {
    records: Array<{
      missionId: string;
      customer: string;
      currentState: string;
      blockingIssues: string[];
      ceoReviewStatus: string;
    }>;
  };
  workforce: {
    utilization: number | null;
    status: DataAvailabilityStatus;
    workerDetails?: Array<{ workerId: string; status: string }>;
  };
  customerPipeline: {
    status: DataAvailabilityStatus;
    totalCustomers: number;
  };
  opportunityPortfolio: {
    status: DataAvailabilityStatus;
    estimatedPortfolioValue?: number;
    rows?: Array<{ proposalId: string }>;
  };
  websiteBusinessLaunch?: {
    status: DataAvailabilityStatus;
    newLeads: number;
    activeCustomers: number;
    websiteProjects: number;
    revenuePipelineEstimated: number;
    projectsAwaitingApproval: number;
    revisionQueue: number;
    customerSatisfaction: {
      status: string;
      score: number | null;
      note: string;
    };
  };
  providerHealth: {
    status: DataAvailabilityStatus;
    providers: Array<{
      providerName: string;
      configuredStatus: DataAvailabilityStatus;
      connectionStatus: DataAvailabilityStatus;
      readCapabilityStatus: DataAvailabilityStatus;
      writeCapabilityStatus: DataAvailabilityStatus;
      warnings: string[];
    }>;
  };
  systemHealth: {
    status: DataAvailabilityStatus;
    summary: string;
  };
  alerts: {
    alerts: Array<{
      alertId: string;
      severity: string;
      title: string;
      category: string;
      recommendedAction?: string | null;
    }>;
  };
  activityFeed: {
    events: Array<{
      eventId: string;
      timestamp: string;
      severity: string;
      title: string;
      description: string;
      sourceSystem: string;
    }>;
  };
  generatedAt: string;
  dataFreshness: Array<{ section: string; status: DataAvailabilityStatus; checkedAt: string; notes?: string[] }>;
  missingData: string[];
  limitations: string[];
  recommendedExecutiveActions: Array<{ action: string; reason: string; decisionId?: string; alertId?: string }>;
  dashboardStatus: DataAvailabilityStatus;
};

export type ConnectionMode = 'live' | 'fixture';

export type DashboardQueryResult = {
  mode: ConnectionMode;
  envelope: ApiEnvelope<DashboardSnapshot>;
  sourceLabel: 'LIVE_API' | 'DEVELOPMENT_DATA';
};

export type CustomerProjectRecord = {
  projectId: string;
  missionId: string;
  customerId: string;
  customerAccount: {
    accountId: string | null;
    customerId: string;
    email: string | null;
    stripeCustomerId: string | null;
  };
  projectStatus: string;
  submittedDate: string;
  currentStage: string;
  estimatedCompletion: string | null;
  assignedWorkforce: string[];
  executiveReviewStatus: string;
  revisionCount: number;
  messages: Array<{ type: string; text: string; createdAt: string }>;
  percentComplete: number;
  qaStatus: string;
  qaResults?: {
    score: number;
    status: string;
    issuesRemaining: number;
    checklist: Record<string, unknown> | null;
  };
  blockedIssues: string[];
  timeline?: Array<{ event: string; at: string; details: string }>;
  files?: Array<{ key: string; label: string; path: string; available: boolean }>;
  invoices?: Array<{ invoiceId: string; status: string; amount: number | null; currency: string; dueDate: string | null }>;
  downloadDeliverables: Array<{ key: string; label: string; path: string; available: boolean }>;
};

export type CustomerProjectsResponse = {
  customerId: string;
  account: {
    accountId: string;
    customerId: string;
    companyName: string;
    email: string;
    phone: string;
    createdAt: string;
    lastSeenAt: string;
    stripeCustomerId: string | null;
    stripeLinkagePlanned: boolean;
  } | null;
  projects: CustomerProjectRecord[];
};

export type CustomerRequestPayload = {
  businessName: string;
  businessType: string;
  websiteUrl?: string;
  contactName: string;
  email: string;
  phone: string;
  targetAudience: string;
  businessDescription: string;
  goals: string[];
  budget: string;
  timeline: string;
  preferredStyle?: string;
  preferredColors: string[];
  desiredPages: string[];
  specialFeatures: string[];
  competitors: string[];
  notes?: string;
  logoUpload?: { name: string; size: number; type: string } | null;
  imageUploads: Array<{ name: string; size: number; type: string }>;
  brandAssetsUpload: Array<{ name: string; size: number; type: string }>;
};

export type CustomerRequestResponse = {
  confirmationId: string;
  requestId: string;
  missionId: string;
  customerId: string;
  accountId: string;
  sessionId: string;
  missionType: string;
  routedTo: string;
  message: string;
};

export type CustomerRevisionResponse = {
  missionId: string;
  revisionMissionId: string;
  revisionCount: number;
};

export type CustomerLoginResponse = {
  customerId: string;
  accountStatus: string;
  sessionToken?: string;
  sessionId: string;
  expiresAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  developmentAuthentication?: boolean;
};

export type CustomerRegistrationResponse = {
  customerId: string;
  email: string;
  verificationRequired: boolean;
  warnings?: string[];
};

export type CustomerCurrentSessionResponse = {
  customerId: string;
  accountStatus: string;
  sessionId: string;
  expiresAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
};

export type CustomerSessionRefreshResponse = {
  sessionToken?: string;
  sessionId: string;
  expiresAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  rotationCounter: number;
};

export type CustomerPasswordResetRequestResponse = {
  accepted: boolean;
  message: string;
  developmentResetToken?: string | null;
};

export type CustomerPasswordResetCompleteResponse = {
  completed: boolean;
};

export type CustomerCompletionApprovalResponse = {
  missionId: string;
  currentStage: string;
  executiveStatus: string;
  message: string;
};

export type CustomerDownloadsResponse = {
  missionId: string;
  downloads: Array<{ key: string; label: string; path: string; available: boolean }>;
};
