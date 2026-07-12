const SUMMARY_FIELDS = [
  { key: 'overallHealth', label: 'System Health' },
  { key: 'businessCount', label: 'Businesses' },
  { key: 'activeMissionCount', label: 'Active Missions' },
  { key: 'pendingCEOApprovals', label: 'Pending CEO Decisions' },
  { key: 'publishingReady', label: 'Publishing Readiness' },
  { key: 'criticalAlerts', label: 'Critical Alerts' }
];

const EXECUTIVE_QUEUE_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export function renderConsoleDashboard(snapshot = {}) {
  return `
    <div class="console-shell">
      ${renderHeader(snapshot)}
      <section class="dashboard-grid">
        ${renderExecutiveSummary(snapshot)}
        ${renderMissionQueue(snapshot)}
        ${renderBusinessOverview(snapshot)}
        ${renderProviderStatus(snapshot)}
        ${renderExecutiveQueue(snapshot)}
        ${renderKnowledgeUpdates(snapshot)}
        ${renderOperationsHealth(snapshot)}
        ${renderFutureActions()}
      </section>
    </div>
  `;
}

function renderHeader(snapshot) {
  const generatedAt = snapshot.diagnostics?.snapshotGenerationTime
    ?? snapshot.diagnostics?.snapshotTimestamp
    ?? 'unknown';

  return `
    <header class="page-header">
      <div>
        <p class="eyebrow">Internal Read-Only</p>
        <h1>CEO Operations Console</h1>
        <p class="lede">Snapshot generated at ${escapeHtml(generatedAt)}</p>
      </div>
      <div class="header-badge">
        ${escapeHtml(snapshot.executiveSummary?.overallHealth ?? 'UNKNOWN')}
      </div>
    </header>
  `;
}

function renderExecutiveSummary(snapshot) {
  const summary = snapshot.executiveSummary ?? {};

  return `
    <section class="panel" data-section="executive-summary">
      <div class="section-title-row">
        <h2>Executive Summary</h2>
      </div>
      <div class="summary-grid">
        ${SUMMARY_FIELDS.map(field => `
          <article class="summary-card">
            <span>${escapeHtml(field.label)}</span>
            <strong>${escapeHtml(formatSummaryValue(summary[field.key]))}</strong>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function renderMissionQueue(snapshot) {
  const missions = snapshot.missions ?? [];

  return `
    <section class="panel" data-section="mission-queue">
      <div class="section-title-row">
        <h2>Mission Queue</h2>
      </div>
      ${missions.length > 0 ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mission ID</th>
                <th>Business</th>
                <th>Stage</th>
                <th>Quality</th>
                <th>Executive Decision</th>
                <th>Publishing Status</th>
                <th>Risk</th>
                <th>Next Action</th>
              </tr>
            </thead>
            <tbody>
              ${missions.map(mission => `
                <tr>
                  <td>${escapeHtml(mission.missionId)}</td>
                  <td>${escapeHtml(mission.businessId)}</td>
                  <td>${escapeHtml(mission.stage)}</td>
                  <td>${escapeHtml(mission.qualityDecision)}</td>
                  <td>${escapeHtml(mission.executiveDecision)}</td>
                  <td>${escapeHtml(mission.publishDecision)}</td>
                  <td>${escapeHtml(mission.riskLevel)}</td>
                  <td>${escapeHtml(mission.nextRequiredAction)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<p class="empty-state">No missions in the queue.</p>'}
    </section>
  `;
}

function renderBusinessOverview(snapshot) {
  const businesses = snapshot.business ?? [];

  return `
    <section class="panel" data-section="business-overview">
      <div class="section-title-row">
        <h2>Business Overview</h2>
      </div>
      ${businesses.length > 0 ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Registered businesses</th>
                <th>Health</th>
                <th>Mission count</th>
                <th>Knowledge count</th>
                <th>Asset count</th>
              </tr>
            </thead>
            <tbody>
              ${businesses.map(business => `
                <tr>
                  <td>${escapeHtml(business.displayName ?? business.businessId)}</td>
                  <td>${escapeHtml(business.status ?? 'UNKNOWN')}</td>
                  <td>${escapeHtml(String(business.activeMissions ?? 0))}</td>
                  <td>${escapeHtml(String(business.knowledgeItems ?? 0))}</td>
                  <td>${escapeHtml(String(business.assetCount ?? 0))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<p class="empty-state">No registered businesses.</p>'}
    </section>
  `;
}

function renderProviderStatus(snapshot) {
  const operations = snapshot.operations ?? {};
  const summary = snapshot.executiveSummary ?? {};
  const providerStatus = snapshot.providerStatus ?? {};
  const providerSummary = providerStatus.providerSummary ?? operations.providerSummary ?? {};
  const providerHealth = operations.providerHealth ?? providerStatus.providerHealth ?? {};
  const credentialHealth = snapshot.credentialStatus ?? {};
  const quotaWarnings = providerStatus.quotaWarnings ?? operations.quotaWarnings ?? [];
  const failedProviders = providerStatus.failedProviders ?? operations.failedProviders ?? [];
  const viewModel = snapshot.viewModel ?? {};
  const credentialWarningCount = Number(viewModel.credentialWarningCount ?? summary.credentialWarnings ?? operations.credentialWarnings ?? 0);
  const providerCount = Number(viewModel.providerCount ?? summary.configuredProviders ?? providerSummary.providerCount ?? 0);

  return `
    <section class="panel" data-section="provider-status">
      <div class="section-title-row">
        <h2>Provider Status</h2>
      </div>
      <div class="provider-matrix">
        <div><span>Providers</span><strong>${escapeHtml(String(providerCount))}</strong></div>
        <div><span>Credential health</span><strong>${escapeHtml(credentialWarningCount > 0 ? 'WARNING' : (credentialHealth.status ?? 'HEALTHY'))}</strong></div>
        <div><span>Warnings</span><strong>${escapeHtml(String(quotaWarnings.length + credentialWarningCount))}</strong></div>
        <div><span>Quota status</span><strong>${escapeHtml(providerHealth.status ?? (quotaWarnings.length > 0 ? 'WARNING' : 'CLEAR'))}</strong></div>
      </div>
      <div class="subtle-list">
        <p><span>Failed providers:</span> ${escapeHtml(failedProviders.length > 0 ? failedProviders.join(', ') : 'None')}</p>
        <p><span>Quota warnings:</span> ${escapeHtml(quotaWarnings.length > 0 ? quotaWarnings.map(item => item.providerId ?? item.warning ?? 'UNKNOWN').join(', ') : 'None')}</p>
        <p><span>Provider health:</span> ${escapeHtml(providerHealth.status ?? 'UNKNOWN')}</p>
      </div>
    </section>
  `;
}

function renderExecutiveQueue(snapshot) {
  const items = snapshot.executiveQueue?.items ?? [];
  const orderedItems = EXECUTIVE_QUEUE_ORDER.flatMap(priority => items.filter(item => item.severity === priority));

  return `
    <section class="panel" data-section="executive-queue">
      <div class="section-title-row">
        <h2>Executive Queue</h2>
      </div>
      ${orderedItems.length > 0 ? `
        <ol class="queue-list">
          ${orderedItems.map(item => `
            <li data-priority="${escapeHtml(item.severity)}">
              <strong>${escapeHtml(item.severity)}</strong>
              <span>${escapeHtml(item.type ?? 'GENERAL')}</span>
              <p>${escapeHtml(item.message ?? 'Executive attention required.')}</p>
            </li>
          `).join('')}
        </ol>
      ` : '<p class="empty-state">No executive actions required.</p>'}
    </section>
  `;
}

function renderKnowledgeUpdates(snapshot) {
  const operations = snapshot.operations ?? {};
  const viewModel = snapshot.viewModel ?? {};
  const recentLessons = viewModel.recentLessons ?? operations.recentLessons ?? snapshot.recentLessons ?? [];
  const validatedLearning = viewModel.validatedLearning ?? operations.knowledgeUpdates ?? snapshot.knowledgeUpdates ?? [];
  const candidateItems = viewModel.knowledgeCandidates ?? (snapshot.business ?? []).map(business => ({
    title: `${business.displayName ?? business.businessId}: ${business.knowledgeItems ?? 0} knowledge candidates`
  }));

  return `
    <section class="panel" data-section="knowledge-updates">
      <div class="section-title-row">
        <h2>Knowledge Updates</h2>
      </div>
      <div class="knowledge-grid">
        <div>
          <h3>Recent lessons</h3>
          ${renderBulletedList(recentLessons, 'No recent lessons.')}
        </div>
        <div>
          <h3>Validated learning</h3>
          ${renderBulletedList(validatedLearning, 'No validated learning yet.')}
        </div>
        <div>
          <h3>Knowledge candidates</h3>
          ${renderBulletedList(candidateItems, 'No knowledge candidates yet.')}
        </div>
      </div>
    </section>
  `;
}

function renderOperationsHealth(snapshot) {
  const operations = snapshot.operations ?? {};
  const summary = snapshot.executiveSummary ?? {};
  const viewModel = snapshot.viewModel ?? {};
  const providerCount = Number(viewModel.providerCount ?? summary.configuredProviders ?? snapshot.providerStatus?.providerSummary?.providerCount ?? 0);
  const credentialCount = Number(viewModel.credentialWarningCount ?? summary.credentialWarnings ?? 0);

  return `
    <section class="panel" data-section="operations-health">
      <div class="section-title-row">
        <h2>Operations Health</h2>
      </div>
      <div class="provider-matrix">
        <div><span>Runtime</span><strong>${escapeHtml(summary.overallHealth ?? 'UNKNOWN')}</strong></div>
        <div><span>Publishing</span><strong>${escapeHtml(String(summary.publishingReady ?? 0))}</strong></div>
        <div><span>Quality</span><strong>${escapeHtml(String((operations.qualityAlerts ?? []).length))}</strong></div>
        <div><span>Knowledge</span><strong>${escapeHtml(String((operations.knowledgeUpdates ?? []).length))}</strong></div>
        <div><span>Providers</span><strong>${escapeHtml(String(providerCount))}</strong></div>
        <div><span>Credentials</span><strong>${escapeHtml(String(credentialCount))}</strong></div>
        <div><span>Overall status</span><strong>${escapeHtml(summary.overallHealth ?? 'UNKNOWN')}</strong></div>
      </div>
    </section>
  `;
}

function renderFutureActions() {
  return `
    <section class="panel" data-section="future-actions">
      <div class="section-title-row">
        <h2>Future Actions</h2>
      </div>
      <div class="button-row">
        <button disabled>Approve Mission</button>
        <button disabled>Reject Mission</button>
        <button disabled>Publish</button>
        <button disabled>Retry</button>
        <button disabled>Refresh</button>
      </div>
    </section>
  `;
}

function renderBulletedList(items, emptyLabel) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p class="empty-state">${escapeHtml(emptyLabel)}</p>`;
  }

  return `
    <ul>
      ${items.map(item => `<li>${escapeHtml(item.title ?? item.message ?? String(item))}</li>`).join('')}
    </ul>
  `;
}

function formatSummaryValue(value) {
  if (typeof value === 'number') {
    return String(value);
  }

  if (value === null || value === undefined || value === '') {
    return '0';
  }

  return String(value);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
