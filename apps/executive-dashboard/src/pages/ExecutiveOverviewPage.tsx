import { SectionCard } from '../components/SectionCard';
import { StatusBadge } from '../components/StatusBadge';
import { messageForApiCode } from '../api/errors';
import type { DashboardQueryResult } from '../api/types';

type ExecutiveOverviewPageProps = {
  loading: boolean;
  result: DashboardQueryResult | null;
  error: { code: string; message: string } | null;
  isStale: boolean;
  staleMinutes: number | null;
};

function freshnessFor(result: DashboardQueryResult | null, section: string): string {
  const item = result?.envelope.dataFreshness?.find((entry) => entry.section === section);
  return item?.status ?? 'UNAVAILABLE';
}

export function ExecutiveOverviewPage({ loading, result, error, isStale, staleMinutes }: ExecutiveOverviewPageProps) {
  if (loading) {
    return <section className="panel"><p>Loading executive dashboard snapshot...</p></section>;
  }

  if (error) {
    return (
      <section className="panel" role="alert">
        <h2>Dashboard connection error</h2>
        <p>{messageForApiCode(error.code as never)}</p>
        <p className="muted">Error category: {error.code}</p>
      </section>
    );
  }

  if (!result) {
    return <section className="panel"><p>No dashboard response available.</p></section>;
  }

  const snapshot = result.envelope.data;
  const launch = snapshot.websiteBusinessLaunch;
  const records = snapshot.missionControl.records ?? [];
  const blocked = records.filter((mission) => (mission.blockingIssues ?? []).length > 0).length;
  const review = records.filter((mission) => mission.ceoReviewStatus === 'REQUIRES_CEO_REVIEW').length;

  return (
    <>
      {result.sourceLabel === 'DEVELOPMENT_DATA' ? (
        <section className="banner warning" role="status">DEVELOPMENT DATA MODE: dashboard values are fixtures and not operational telemetry.</section>
      ) : null}
      {isStale ? (
        <section className="banner warning" role="status">Snapshot appears stale ({staleMinutes} minutes old).</section>
      ) : null}

      <div className="card-grid cards-4">
        <SectionCard title="Active Missions" status={snapshot.executiveOverview.dataAvailability}>
          <p className="metric">{snapshot.executiveOverview.activeMissions}</p>
        </SectionCard>
        <SectionCard title="Awaiting Executive Review" status={freshnessFor(result, 'ceoDecisionCenter')}>
          <p className="metric">{snapshot.executiveOverview.missionsAwaitingCeoReview || review}</p>
        </SectionCard>
        <SectionCard title="Blocked Missions" status={freshnessFor(result, 'missionControl')}>
          <p className="metric">{snapshot.executiveOverview.blockedMissions || blocked}</p>
        </SectionCard>
        <SectionCard title="Customers" status={snapshot.customerPipeline.status}>
          <p className="metric">{snapshot.customerPipeline.totalCustomers}</p>
        </SectionCard>
      </div>

      <div className="card-grid cards-2">
        <SectionCard title="Website Business Launch" status={launch?.status ?? 'PARTIAL'}>
          <p>New Leads: {launch?.newLeads ?? 0}</p>
          <p>Active Customers: {launch?.activeCustomers ?? snapshot.customerPipeline.totalCustomers}</p>
          <p>Website Projects: {launch?.websiteProjects ?? snapshot.executiveOverview.totalMissions}</p>
          <p>Projects Awaiting Approval: {launch?.projectsAwaitingApproval ?? snapshot.executiveOverview.missionsAwaitingCeoReview}</p>
          <p>Revision Queue: {launch?.revisionQueue ?? 0}</p>
          <p>Customer Satisfaction: {launch?.customerSatisfaction?.status ?? 'PLACEHOLDER'}</p>
        </SectionCard>

        <SectionCard title="Opportunity Portfolio" status={snapshot.opportunityPortfolio.status} subtitle="Estimated pipeline value is not recognized revenue.">
          <p className="metric">{snapshot.executiveOverview.currentPortfolioValue.toLocaleString()}</p>
          <p><StatusBadge status="ESTIMATED" /> pipeline value estimate</p>
        </SectionCard>

        <SectionCard title="Workforce" status={snapshot.workforce.status}>
          <p className="metric">{snapshot.workforce.utilization == null ? 'N/A' : `${Math.round(snapshot.workforce.utilization * 100)}%`}</p>
          <p>Worker records: {snapshot.workforce.workerDetails?.length ?? 0}</p>
        </SectionCard>
      </div>

      <div className="card-grid cards-3">
        <SectionCard title="Provider Health" status={snapshot.providerHealth.status}>
          <ul>
            {snapshot.providerHealth.providers.map((provider) => (
              <li key={provider.providerName}>
                <strong>{provider.providerName}</strong> <StatusBadge status={provider.connectionStatus} />
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Atlas System Health" status={snapshot.systemHealth.status}>
          <p>{snapshot.systemHealth.summary}</p>
        </SectionCard>

        <SectionCard title="Executive Alerts" status={freshnessFor(result, 'alerts')}>
          {snapshot.alerts.alerts.length === 0 ? <p>No active alerts.</p> : (
            <ul>
              {snapshot.alerts.alerts.slice(0, 5).map((alert) => (
                <li key={alert.alertId}>{alert.severity}: {alert.title}</li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="card-grid cards-2">
        <SectionCard title="Recent Activity" status={freshnessFor(result, 'activityFeed')}>
          {snapshot.activityFeed.events.length === 0 ? <p>Activity feed is empty.</p> : (
            <ul>
              {snapshot.activityFeed.events.slice(0, 6).map((event) => (
                <li key={event.eventId}>{new Date(event.timestamp).toLocaleString()} - {event.title}</li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Recommended Executive Actions" status={snapshot.dashboardStatus}>
          {snapshot.recommendedExecutiveActions.length === 0 ? <p>No recommendations generated.</p> : (
            <ul>
              {snapshot.recommendedExecutiveActions.slice(0, 6).map((action, index) => (
                <li key={`${action.action}_${index}`}>{action.action}: {action.reason}</li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <section className="panel">
        <h2>Data Integrity</h2>
        <p>Snapshot generated: {new Date(snapshot.generatedAt).toLocaleString()}</p>
        <p>Dashboard status: <StatusBadge status={snapshot.dashboardStatus} /></p>
        {snapshot.missingData.length > 0 ? <p>Missing data: {snapshot.missingData.join(' | ')}</p> : <p>No missing data markers.</p>}
        {snapshot.limitations.length > 0 ? <p>Limitations: {snapshot.limitations.join(' | ')}</p> : null}
      </section>
    </>
  );
}
