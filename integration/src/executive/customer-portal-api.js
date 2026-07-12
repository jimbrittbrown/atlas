function parseCsvList(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeUploadList(value) {
  return toArray(value).map((item) => {
    if (typeof item === 'string') return { name: item, size: null, type: null };
    return {
      name: item?.name ?? 'unnamed-upload',
      size: Number.isFinite(Number(item?.size)) ? Number(item.size) : null,
      type: item?.type ?? null
    };
  });
}

export class CustomerPortalApi {
  constructor({ manager } = {}) {
    this.manager = manager;
  }

  listProjects({ customerId } = {}) {
    return this.manager.listProjects({ customerId });
  }

  register({ body = {} } = {}) {
    return this.manager.register({
      email: body.email,
      password: body.password,
      companyName: body.companyName ?? null,
      contactName: body.contactName ?? null
    });
  }

  getProject({ customerId, projectId } = {}) {
    return this.manager.getProject({ customerId, projectId });
  }

  createPaymentCheckout({ customerId, requestedBy, body = {} } = {}) {
    return this.manager.createPaymentCheckout({
      customerId,
      missionId: body.missionId,
      amount: body.amount,
      currency: body.currency ?? 'USD',
      description: body.description ?? null,
      successUrl: body.successUrl ?? null,
      cancelUrl: body.cancelUrl ?? null,
      requestedBy: requestedBy ?? body.requestedBy ?? 'CUSTOMER_PORTAL'
    });
  }

  listPaymentHistory({ customerId } = {}) {
    return this.manager.listPaymentHistory({ customerId });
  }

  paymentHealth() {
    return {
      accepted: true,
      status: 200,
      code: 'OK',
      reason: null,
      data: this.manager.getPaymentHealth()
    };
  }

  handlePaymentWebhook({ providerType = 'stripe', headers = {}, body = {}, rawBody = '' } = {}) {
    return this.manager.handlePaymentWebhook({
      providerType,
      headers,
      payload: body,
      rawBody
    });
  }

  createRequest({ customerId, accountId, sessionId, requestedBy, body = {} } = {}) {
    const payload = {
      customerId,
      accountId,
      sessionId,
      requestedBy,
      businessName: body.businessName,
      businessType: body.businessType,
      websiteUrl: body.websiteUrl ?? null,
      contactName: body.contactName,
      email: body.email,
      phone: body.phone,
      targetAudience: body.targetAudience,
      businessDescription: body.businessDescription,
      goals: toArray(body.goals?.length ? body.goals : parseCsvList(body.goals)),
      budget: body.budget,
      timeline: body.timeline,
      preferredStyle: body.preferredStyle ?? null,
      preferredColors: toArray(body.preferredColors?.length ? body.preferredColors : parseCsvList(body.preferredColors)),
      desiredPages: toArray(body.desiredPages?.length ? body.desiredPages : parseCsvList(body.desiredPages)),
      specialFeatures: toArray(body.specialFeatures?.length ? body.specialFeatures : parseCsvList(body.specialFeatures)),
      competitors: toArray(body.competitors?.length ? body.competitors : parseCsvList(body.competitors)),
      notes: body.notes ?? null,
      logoUpload: body.logoUpload ?? null,
      imageUploads: normalizeUploadList(body.imageUploads),
      brandAssetsUpload: normalizeUploadList(body.brandAssetsUpload),
      timestamp: body.timestamp,
      requestedBy: requestedBy ?? body.requestedBy ?? 'CUSTOMER_PORTAL'
    };

    return this.manager.submitWebsiteRequest(payload);
  }

  login({ body = {} } = {}) {
    return this.manager.login({
      email: body.email,
      password: body.password,
      customerId: body.customerId ?? null,
      accountId: body.accountId ?? null,
      sessionId: body.sessionId ?? null,
      timestamp: body.timestamp
    });
  }

  logout({ sessionToken } = {}) {
    return this.manager.logout({ sessionToken });
  }

  refreshSession({ sessionToken } = {}) {
    return this.manager.refreshSession({ sessionToken });
  }

  getCurrentSession({ sessionToken } = {}) {
    return this.manager.getCurrentSession({ sessionToken });
  }

  requestPasswordReset({ body = {} } = {}) {
    return this.manager.requestPasswordReset({ email: body.email });
  }

  completePasswordReset({ body = {} } = {}) {
    return this.manager.completePasswordReset({ token: body.token, newPassword: body.newPassword });
  }

  revokeAllSessions({ customerId } = {}) {
    return this.manager.revokeAllSessions({ customerId });
  }

  authHealth() {
    return {
      accepted: true,
      status: 200,
      code: 'OK',
      reason: null,
      data: this.manager.getAuthHealth()
    };
  }

  authenticateSession({ sessionToken, customerId = null } = {}) {
    return this.manager.authenticateSession({ sessionToken, customerId });
  }

  requestRevision({ customerId, requestedBy, body = {} } = {}) {
    return this.manager.requestRevision({
      customerId,
      missionId: body.missionId,
      reason: body.reason,
      notes: body.notes ?? null,
      requestedBy: requestedBy ?? body.requestedBy ?? 'CUSTOMER_PORTAL',
      timestamp: body.timestamp
    });
  }

  getDownloads({ customerId, projectId } = {}) {
    return this.manager.getDownloads({ customerId, projectId });
  }

  approveCompletion({ customerId, requestedBy, body = {} } = {}) {
    return this.manager.approveCompletion({
      customerId,
      missionId: body.missionId,
      requestedBy: requestedBy ?? body.requestedBy ?? 'CUSTOMER_PORTAL',
      notes: body.notes ?? null,
      timestamp: body.timestamp
    });
  }
}
