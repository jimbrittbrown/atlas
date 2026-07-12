import { randomUUID } from 'node:crypto';
import {
  createCustomerPortalLoginRequest,
  createCustomerPortalRevisionRequest,
  createCustomerPortalSession,
  createCustomerPortalWebsiteRequest,
  CustomerPortalMissionType,
  validateCustomerPortalLoginRequest,
  validateCustomerPortalRevisionRequest,
  validateCustomerPortalWebsiteRequest
} from './customer-portal-contracts.js';
import { CustomerAuthManager } from './customer-auth-manager.js';
import { PaymentManager } from './payment-manager.js';
import { SignedArtifactDeliveryManager } from './signed-artifact-delivery-manager.js';
import { MissionExecutiveStatuses } from './customer-intake-mission-control-contracts.js';
import { DataAvailabilityStatuses } from './executive-operations-dashboard-contracts.js';
import { getMetaMap, setMetaValue } from '../storage/provider-backed-state.js';

function nowIso(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalize(value) {
  return String(value ?? '').trim();
}

function roleSafeString(value, fallback = null) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : fallback;
}

function mapMissionToProject(
  mission,
  customer,
  session,
  workforceDashboard,
  revisionCounts = {},
  requestRecord = null,
  revisionRecords = [],
  productionReview = null,
  paymentHistory = [],
  downloads = []
) {
  const workers = toArray(workforceDashboard?.currentWorkload)
    .filter((item) => item.missionId === mission.missionId)
    .flatMap((item) => toArray(item.workers))
    .map((worker) => worker.workerName ?? worker.workerId ?? 'UNASSIGNED');

  return {
    projectId: mission.missionId,
    missionId: mission.missionId,
    customerId: mission.customerId,
    customerAccount: {
      accountId: session?.accountId ?? null,
      customerId: customer?.customerId ?? mission.customerId,
      email: customer?.email ?? null,
      stripeCustomerId: session?.stripeCustomerId ?? null
    },
    projectStatus: mission.executiveStatus,
    submittedDate: mission.startedDate,
    currentStage: mission.currentStage,
    estimatedCompletion: mission.estimatedFinish ?? null,
    assignedWorkforce: workers,
    executiveReviewStatus: mission.executiveStatus,
    revisionCount: Number(revisionCounts[mission.missionId] ?? mission.revisionCount ?? 0),
    messages: toArray(requestRecord?.messages),
    percentComplete: Number(mission.progress ?? 0),
    qaStatus: productionReview?.qa?.status ?? mission.qaStatus ?? 'NOT_STARTED',
    qaResults: {
      score: Number(productionReview?.qa?.score ?? 0),
      status: productionReview?.qa?.status ?? mission.qaStatus ?? 'NOT_STARTED',
      issuesRemaining: Number(productionReview?.qa?.issuesRemaining ?? 0),
      checklist: productionReview?.deliveryPackage?.deliveryChecklist ?? null
    },
    blockedIssues: toArray(mission.blockedIssues),
    timeline: [
      {
        event: 'REQUEST_SUBMITTED',
        at: requestRecord?.submittedDate ?? mission.startedDate,
        details: 'Website request routed through Mission Control.'
      },
      ...toArray(revisionRecords).map((revision) => ({
        event: 'REVISION_REQUESTED',
        at: revision.timestamp,
        details: revision.reason
      })),
      productionReview ? {
        event: 'PRODUCTION_QA_RECORDED',
        at: productionReview.updatedAt,
        details: `QA status ${productionReview.qa?.status ?? 'UNKNOWN'} at score ${productionReview.qa?.score ?? 0}.`
      } : null
    ].filter(Boolean),
    files: [
      {
        key: 'PORTAL_REQUEST',
        label: 'Website Request Payload',
        path: `review/${requestRecord?.requestId ?? mission.missionId}-request.json`,
        available: Boolean(requestRecord)
      },
      {
        key: 'EXECUTIVE_REVIEW',
        label: 'Executive Review Package',
        path: 'review/website-executive-review-package-v1-report.md',
        available: true
      }
    ],
    invoices: [
      {
        invoiceId: `inv_${mission.missionId}`,
        status: 'PLACEHOLDER',
        amount: null,
        currency: 'USD',
        dueDate: null
      }
    ],
    paymentSummary: {
      latestPayment: paymentHistory.length > 0 ? paymentHistory[paymentHistory.length - 1] : null,
      totalPayments: paymentHistory.length,
      successfulPayments: paymentHistory.filter((payment) => String(payment.status ?? '').toUpperCase() === 'SUCCEEDED').length,
      pendingPayments: paymentHistory.filter((payment) => String(payment.status ?? '').toUpperCase() === 'CHECKOUT_PENDING').length
    },
    downloadDeliverables: toArray(downloads.length > 0 ? downloads : requestRecord?.downloadDeliverables)
  };
}

export class CustomerPortalManager {
  constructor({
    missionControl,
    executivePlanningSystem,
    workforceDirector,
    missionOrchestratorManager,
    websiteProductionManager,
    authManager,
    paymentManager,
    storageProvider,
    now,
    logger,
    namespace = 'executive.customer-portal'
  } = {}) {
    this.missionControl = missionControl ?? null;
    this.executivePlanningSystem = executivePlanningSystem ?? null;
    this.workforceDirector = workforceDirector ?? missionControl?.workforceDirector ?? null;
    this.missionOrchestratorManager = missionOrchestratorManager ?? null;
    this.websiteProductionManager = websiteProductionManager ?? null;
    this.storageProvider = storageProvider ?? null;
    this.now = now;
    this.logger = logger ?? { log: () => {} };
    this.authManager = authManager ?? new CustomerAuthManager({
      missionControl: this.missionControl,
      storageProvider: this.storageProvider,
      now: this.now,
      logger: this.logger
    });
    this.paymentManager = paymentManager ?? new PaymentManager({
      missionControl: this.missionControl,
      storageProvider: this.storageProvider,
      now: this.now,
      logger: this.logger
    });
    this.artifactDeliveryManager = new SignedArtifactDeliveryManager({
      missionControl: this.missionControl,
      websiteProductionManager: this.websiteProductionManager,
      storageProvider: this.storageProvider,
      now: this.now,
      logger: this.logger
    });
    this.namespace = namespace;

    this.customerAccounts = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.accounts` });
    this.customerSessions = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.sessions` });
    this.portalRequests = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.requests` });
    this.revisionHistory = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.revisions` });
  }

  persistAccount(account) {
    if (!account?.accountId) return;
    this.customerAccounts.set(account.accountId, account);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.accounts`, key: account.accountId, value: account });
  }

  persistSession(session) {
    if (!session?.sessionId) return;
    this.customerSessions.set(session.sessionId, session);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.sessions`, key: session.sessionId, value: session });
  }

  persistRequest(record) {
    if (!record?.requestId) return;
    this.portalRequests.set(record.requestId, record);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.requests`, key: record.requestId, value: record });
  }

  persistRevisionHistory(rootMissionId, records) {
    if (!rootMissionId) return;
    this.revisionHistory.set(rootMissionId, records);
    setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.revisions`, key: rootMissionId, value: records });
  }

  ensureCustomerAccount({ customer, accountId = null } = {}) {
    const existing = Array.from(this.customerAccounts.values()).find((item) => item.customerId === customer.customerId);
    if (existing) {
      const updated = {
        ...existing,
        email: customer.email ?? existing.email,
        companyName: customer.companyName ?? existing.companyName,
        lastSeenAt: nowIso(this.now)
      };
      this.persistAccount(updated);
      return updated;
    }

    const account = {
      accountId: roleSafeString(accountId, `cpa_${randomUUID()}`),
      customerId: customer.customerId,
      companyName: customer.companyName,
      email: customer.email,
      phone: customer.phone,
      createdAt: nowIso(this.now),
      lastSeenAt: nowIso(this.now),
      stripeCustomerId: null,
      stripeLinkagePlanned: true
    };

    this.persistAccount(account);
    return account;
  }

  ensureSession({ customer, account, sessionId = null } = {}) {
    if (sessionId && this.customerSessions.has(sessionId)) {
      const existing = this.customerSessions.get(sessionId);
      const refreshed = {
        ...existing,
        customerId: customer.customerId,
        accountId: account.accountId,
        lastSeenAt: nowIso(this.now)
      };
      this.persistSession(refreshed);
      return refreshed;
    }

    const session = createCustomerPortalSession({
      customerId: customer.customerId,
      accountId: account.accountId,
      sessionId,
      stripeCustomerId: account.stripeCustomerId,
      createdAt: nowIso(this.now)
    });

    this.persistSession(session);
    return session;
  }

  login(input = {}) {
    const login = createCustomerPortalLoginRequest(input);
    const validation = validateCustomerPortalLoginRequest(login);

    if (!validation.isValid) {
      return {
        accepted: false,
        status: 400,
        code: 'INVALID_REQUEST',
        reason: validation.issues.join(' | '),
        data: null
      };
    }

    return this.authManager.login({
      email: login.email,
      password: input.password
    });
  }

  register(input = {}) {
    return this.authManager.register({
      email: input.email,
      password: input.password,
      companyName: input.companyName ?? null,
      contactName: input.contactName ?? null
    });
  }

  logout({ sessionToken } = {}) {
    return this.authManager.logout({ sessionToken });
  }

  refreshSession({ sessionToken } = {}) {
    return this.authManager.refreshSession({ sessionToken });
  }

  getCurrentSession({ sessionToken } = {}) {
    return this.authManager.getCurrentSession({ sessionToken });
  }

  async startOidcAuthorization(input = {}) {
    return this.authManager.startOidcAuthorization({
      redirectUri: input.redirectUri,
      scope: input.scope ?? 'openid profile email',
      prompt: input.prompt ?? null,
      loginHint: input.loginHint ?? null,
      expiresInMs: input.expiresInMs ?? null,
      provider: input.provider ?? 'oidc',
      state: input.state ?? null,
      nonce: input.nonce ?? null
    });
  }

  requestPasswordReset({ email } = {}) {
    return this.authManager.requestPasswordReset({ email });
  }

  completePasswordReset({ token, newPassword } = {}) {
    return this.authManager.completePasswordReset({ token, newPassword });
  }

  revokeAllSessions({ customerId } = {}) {
    return this.authManager.revokeAllSessions({ customerId });
  }

  authenticateSession({ sessionToken, customerId = null } = {}) {
    return this.authManager.authenticateSession({ sessionToken, customerId });
  }

  getAuthHealth() {
    return this.authManager.getAuthHealth();
  }

  recordAuthRateLimitEvent() {
    this.authManager.recordRateLimitEvent();
  }

  recordPaymentRateLimitEvent() {
    this.paymentManager.recordRateLimitEvent();
  }

  createPaymentCheckout({ customerId, missionId, amount, currency = 'USD', description = null, successUrl = null, cancelUrl = null, requestedBy = 'CUSTOMER_PORTAL' } = {}) {
    const result = this.paymentManager.createCheckoutSession({
      customerId,
      missionId,
      amount,
      currency,
      description,
      successUrl,
      cancelUrl,
      requestedBy
    });

    if (!result.ok) {
      return {
        accepted: false,
        status: result.error?.code === 'NOT_FOUND' ? 404 : (result.error?.code === 'FORBIDDEN' ? 403 : 400),
        code: result.error?.code ?? 'INVALID_REQUEST',
        reason: result.error?.message ?? 'Unable to create payment checkout session.',
        data: null
      };
    }

    return {
      accepted: true,
      status: 200,
      code: 'OK',
      reason: null,
      data: {
        payment: result.data.payment,
        checkout: result.data.checkout,
        providerStatus: result.providerStatus
      }
    };
  }

  listPaymentHistory({ customerId } = {}) {
    const customer = this.resolveCustomerById(customerId);
    if (!customer) {
      return {
        found: false,
        status: 404,
        code: 'NOT_FOUND',
        reason: 'Customer not found.',
        data: null
      };
    }

    return {
      found: true,
      status: 200,
      code: 'OK',
      reason: null,
      data: this.paymentManager.getCustomerPaymentHistory({ customerId })
    };
  }

  getPaymentHealth() {
    return this.paymentManager.getDashboardProjection();
  }

  handlePaymentWebhook({ providerType = 'stripe', headers = {}, payload = null, rawBody = '' } = {}) {
    const result = this.paymentManager.handleWebhook({ providerType, headers, payload, rawBody });
    if (!result.ok) {
      return {
        accepted: false,
        status: result.error?.code === 'WEBHOOK_REJECTED' ? 401 : (result.error?.code === 'NOT_FOUND' ? 404 : 400),
        code: result.error?.code ?? 'INVALID_REQUEST',
        reason: result.error?.message ?? 'Webhook processing rejected.',
        data: null
      };
    }

    return {
      accepted: true,
      status: 200,
      code: 'OK',
      reason: null,
      data: result.data
    };
  }

  getRequestByMissionId(missionId) {
    return Array.from(this.portalRequests.values()).find((request) => request.missionId === missionId) ?? null;
  }

  submitWebsiteRequest(input = {}) {
    const request = createCustomerPortalWebsiteRequest(input);
    const validation = validateCustomerPortalWebsiteRequest(request);

    if (!validation.isValid) {
      return {
        accepted: false,
        status: 400,
        code: 'INVALID_REQUEST',
        reason: validation.issues.join(' | '),
        data: null
      };
    }

    const existingCustomer = input.customerId
      ? this.missionControl.customerRegistry.getCustomerById(input.customerId)
      : null;
    const customerCreation = existingCustomer
      ? { customer: existingCustomer, duplicateDetected: true }
      : this.missionControl.customerRegistry.createCustomer({
        companyName: request.businessName,
        contactName: request.contactName,
        email: request.email,
        phone: request.phone,
        website: request.websiteUrl ?? `https://${request.businessName.toLowerCase().replace(/\s+/g, '-')}.example`,
        industry: request.businessType
      });

    const customer = customerCreation.customer;
    const account = this.ensureCustomerAccount({ customer, accountId: request.accountId });
    const session = this.ensureSession({ customer, account, sessionId: request.sessionId });

    const mission = this.missionControl.missionRegistry.createMission({
      customerId: customer.customerId,
      missionType: CustomerPortalMissionType,
      assignedWorkforce: ['WEBSITE_DIVISION'],
      executiveStatus: MissionExecutiveStatuses.ACTIVE,
      currentStage: 'PORTAL_REQUEST_SUBMITTED',
      progress: 1
    });

    const assignmentPlan = this.workforceDirector?.planMissionAssignments?.({
      missionId: mission.missionId,
      missionType: CustomerPortalMissionType
    }) ?? null;

    const updatedMission = this.missionControl.missionRegistry.updateMission(mission.missionId, {
      currentStage: 'INTAKE_ACCEPTED',
      progress: 5,
      portalRequestId: request.requestId,
      estimatedFinish: assignmentPlan?.ready ? 'IN_PROGRESS_ESTIMATE_PENDING' : 'BLOCKED_PENDING_WORKFORCE',
      blockedIssues: assignmentPlan?.ready ? [] : ['Workforce assignment plan is blocked by unavailable specialists.'],
      qaStatus: 'NOT_STARTED'
    });

    let proposalId = null;
    if (this.executivePlanningSystem?.submitProposal) {
      const proposal = this.executivePlanningSystem.submitProposal({
        sourceType: 'CUSTOMER_PORTAL',
        sourceId: request.requestId,
        customerId: customer.customerId,
        title: `${request.businessName} Website Build Request`,
        description: request.businessDescription,
        missionType: CustomerPortalMissionType,
        requestedOutcome: normalize(request.goals.join('; ')),
        strategicObjective: 'Customer website delivery',
        expectedBusinessValue: 75,
        urgency: 70,
        estimatedEffort: 30,
        estimatedCost: 60000,
        estimatedDuration: 45,
        dependencies: [],
        requiredCapabilities: ['COMPANY_RESEARCH', 'BRAND_PACKAGE_GENERATION', 'TEMPLATE_SELECTION'],
        risks: [{ id: `risk_${request.requestId}`, severity: 0.35 }],
        confidence: 0.74,
        metadata: {
          companyName: request.businessName,
          contactName: request.contactName,
          contactEmail: request.email,
          contactPhone: request.phone,
          website: request.websiteUrl,
          industry: request.businessType,
          adapterType: 'FRAMER',
          providerHint: 'FRAMER_SANDBOX',
          existingBranding: {
            preferredStyle: request.preferredStyle,
            preferredColors: request.preferredColors,
            logoUpload: request.logoUpload,
            imageUploads: request.imageUploads,
            brandAssetsUpload: request.brandAssetsUpload
          },
          commercialContext: {
            budget: request.budget,
            timeline: request.timeline
          },
          portalRequestId: request.requestId,
          missionId: updatedMission.missionId
        }
      });

      proposalId = proposal?.proposal?.proposalId ?? null;
    }

    const requestRecord = {
      requestId: request.requestId,
      missionId: updatedMission.missionId,
      customerId: customer.customerId,
      accountId: account.accountId,
      sessionId: session.sessionId,
      proposalId,
      requestedBy: request.requestedBy,
      submittedDate: request.timestamp,
      payload: request,
      messages: [{
        type: 'SYSTEM',
        text: 'Website request accepted and routed to WEBSITE_BUILD mission flow.',
        createdAt: nowIso(this.now)
      }],
      downloadDeliverables: []
    };

    this.persistRequest(requestRecord);
    this.logger.log({
      event: 'customer_portal_request_submitted',
      requestId: request.requestId,
      missionId: updatedMission.missionId,
      customerId: customer.customerId,
      accountId: account.accountId
    });

    return {
      accepted: true,
      status: 200,
      code: 'OK',
      reason: null,
      data: {
        confirmationId: `confirm_${request.requestId}`,
        requestId: request.requestId,
        missionId: updatedMission.missionId,
        customerId: customer.customerId,
        accountId: account.accountId,
        sessionId: session.sessionId,
        missionType: CustomerPortalMissionType,
        routedTo: 'MISSION_CONTROL',
        message: 'Website request submitted successfully.'
      }
    };
  }

  resolveCustomerById(customerId) {
    if (!customerId) return null;
    return this.missionControl.customerRegistry.getCustomerById(customerId);
  }

  listProjects({ customerId } = {}) {
    const customer = this.resolveCustomerById(customerId);
    if (!customer) {
      return {
        found: false,
        status: 404,
        code: 'NOT_FOUND',
        reason: 'Customer not found.',
        data: null
      };
    }

    const missions = this.missionControl.missionRegistry
      .listMissions()
      .filter((mission) => mission.customerId === customer.customerId);

    const revisionCounts = missions.reduce((acc, mission) => {
      if (mission.revisionOfMissionId) {
        acc[mission.revisionOfMissionId] = Number(acc[mission.revisionOfMissionId] ?? 0) + 1;
      }
      return acc;
    }, {});

    const session = Array.from(this.customerSessions.values()).find((item) => item.customerId === customer.customerId) ?? null;
    const workforceDashboard = this.workforceDirector?.buildDashboard?.() ?? {};
    const productionReviews = this.websiteProductionManager?.listReviews?.() ?? [];
    const paymentHistory = this.paymentManager.listPaymentsForCustomer(customer.customerId);
    const downloadsByMissionId = missions.reduce((acc, mission) => {
      const downloads = this.artifactDeliveryManager.listDownloads({ customerId: customer.customerId, projectId: mission.missionId });
      acc[mission.missionId] = downloads.found ? downloads.data.downloads : [];
      return acc;
    }, {});

    const projects = missions.map((mission) => mapMissionToProject(
      mission,
      customer,
      session,
      workforceDashboard,
      revisionCounts,
      this.getRequestByMissionId(mission.missionId),
      toArray(this.revisionHistory.get(mission.missionId)),
      productionReviews.find((review) => review.missionId === mission.missionId) ?? null,
      paymentHistory.filter((payment) => payment.missionId === mission.missionId),
      downloadsByMissionId[mission.missionId] ?? []
    ));

    return {
      found: true,
      status: 200,
      code: 'OK',
      reason: null,
      data: {
        customerId: customer.customerId,
        account: Array.from(this.customerAccounts.values()).find((item) => item.customerId === customer.customerId) ?? null,
        projects
      }
    };
  }

  getProject({ customerId, projectId } = {}) {
    const list = this.listProjects({ customerId });
    if (!list.found) return list;

    const project = list.data.projects.find((item) => item.projectId === projectId || item.missionId === projectId) ?? null;
    if (!project) {
      return {
        found: false,
        status: 404,
        code: 'NOT_FOUND',
        reason: 'Project not found for customer.',
        data: null
      };
    }

    return {
      found: true,
      status: 200,
      code: 'OK',
      reason: null,
      data: project
    };
  }

  requestRevision(input = {}) {
    const revisionRequest = createCustomerPortalRevisionRequest(input);
    const validation = validateCustomerPortalRevisionRequest(revisionRequest);

    if (!validation.isValid) {
      return {
        accepted: false,
        status: 400,
        code: 'INVALID_REQUEST',
        reason: validation.issues.join(' | '),
        data: null
      };
    }

    const mission = this.missionControl.missionRegistry.getMissionById(revisionRequest.missionId);
    if (!mission) {
      return {
        accepted: false,
        status: 404,
        code: 'NOT_FOUND',
        reason: 'Mission not found.',
        data: null
      };
    }

    if (input.customerId && mission.customerId !== input.customerId) {
      return {
        accepted: false,
        status: 403,
        code: 'FORBIDDEN',
        reason: 'Mission does not belong to customer.',
        data: null
      };
    }

    const revisedMission = this.missionControl.missionRegistry.createMission({
      customerId: mission.customerId,
      missionType: mission.missionType,
      assignedWorkforce: mission.assignedWorkforce,
      executiveStatus: MissionExecutiveStatuses.ACTIVE,
      currentStage: 'REVISION_REQUESTED',
      progress: 1
    });

    const existing = toArray(this.revisionHistory.get(mission.missionId));
    const record = {
      revisionMissionId: revisedMission.missionId,
      reason: revisionRequest.reason,
      notes: revisionRequest.notes,
      requestedBy: revisionRequest.requestedBy,
      timestamp: revisionRequest.timestamp
    };

    const history = [...existing, record];
    this.persistRevisionHistory(mission.missionId, history);

    this.missionControl.missionRegistry.updateMission(revisedMission.missionId, {
      revisionOfMissionId: mission.missionId,
      revisionCount: history.length,
      blockedIssues: [],
      qaStatus: 'NOT_STARTED'
    });

    const requestRecord = this.getRequestByMissionId(mission.missionId);
    if (requestRecord) {
      const updated = {
        ...requestRecord,
        messages: [
          ...toArray(requestRecord.messages),
          {
            type: 'REVISION',
            text: `Revision requested: ${revisionRequest.reason}`,
            createdAt: nowIso(this.now)
          }
        ]
      };
      this.persistRequest(updated);
    }

    return {
      accepted: true,
      status: 200,
      code: 'OK',
      reason: null,
      data: {
        missionId: mission.missionId,
        revisionMissionId: revisedMission.missionId,
        revisionCount: history.length
      }
    };
  }

  getDownloads({ customerId, projectId } = {}) {
    return this.artifactDeliveryManager.listDownloads({ customerId, projectId });
  }

  issueDownloadAuthorization({ customerId, projectId, artifactId, requestedBy, expiresInMs } = {}) {
    return this.artifactDeliveryManager.issueAuthorization({
      customerId,
      projectId,
      artifactId,
      requestedBy,
      expiresInMs
    });
  }

  redeemDownloadAuthorization({ customerId, authorizationToken } = {}) {
    return this.artifactDeliveryManager.redeemAuthorization({
      customerId,
      authorizationToken
    });
  }

  approveCompletion({ customerId, missionId, requestedBy, notes = null, timestamp = nowIso(this.now) } = {}) {
    const mission = this.missionControl.missionRegistry.getMissionById(missionId);
    if (!mission) {
      return {
        accepted: false,
        status: 404,
        code: 'NOT_FOUND',
        reason: 'Mission not found.',
        data: null
      };
    }

    if (customerId && mission.customerId !== customerId) {
      return {
        accepted: false,
        status: 403,
        code: 'FORBIDDEN',
        reason: 'Mission does not belong to customer.',
        data: null
      };
    }

    const updatedMission = this.missionControl.missionRegistry.updateMission(mission.missionId, {
      currentStage: 'CUSTOMER_APPROVED_AWAITING_CEO',
      executiveStatus: MissionExecutiveStatuses.AWAITING_EXECUTIVE_REVIEW,
      blockedIssues: [],
      progress: Math.max(Number(mission.progress ?? 0), 95)
    });

    const requestRecord = this.getRequestByMissionId(mission.missionId);
    if (requestRecord) {
      const updated = {
        ...requestRecord,
        messages: [
          ...toArray(requestRecord.messages),
          {
            type: 'APPROVAL',
            text: `Customer approved completion; awaiting CEO approval.${notes ? ` Notes: ${notes}` : ''}`,
            createdAt: timestamp
          }
        ]
      };
      this.persistRequest(updated);
    }

    this.logger.log({
      event: 'customer_portal_completion_approved',
      missionId: mission.missionId,
      customerId: mission.customerId,
      requestedBy: requestedBy ?? 'CUSTOMER_PORTAL'
    });

    return {
      accepted: true,
      status: 200,
      code: 'OK',
      reason: null,
      data: {
        missionId: updatedMission.missionId,
        currentStage: updatedMission.currentStage,
        executiveStatus: updatedMission.executiveStatus,
        message: 'Completion approval recorded. CEO review remains required before release actions.'
      }
    };
  }

  getDashboardProjection() {
    const allRevisions = Array.from(this.revisionHistory.values()).flatMap((items) => toArray(items));
    const authHealth = this.getAuthHealth();
    const paymentHealth = this.getPaymentHealth();

    return {
      status: this.portalRequests.size > 0 ? DataAvailabilityStatuses.AVAILABLE : DataAvailabilityStatuses.PARTIAL,
      totalRequests: this.portalRequests.size,
      totalAccounts: this.customerAccounts.size,
      activeSessions: this.customerSessions.size,
      totalRevisionRoots: this.revisionHistory.size,
      totalRevisionRequests: allRevisions.length,
      auth: authHealth,
      payments: paymentHealth,
      artifacts: this.artifactDeliveryManager.getDashboardProjection()
    };
  }
}
