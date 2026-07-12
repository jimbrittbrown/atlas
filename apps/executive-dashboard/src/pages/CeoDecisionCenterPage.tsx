import { useEffect, useState } from 'react';
import { messageForApiCode, type DashboardApiError } from '../api/errors';
import { SectionCard } from '../components/SectionCard';
import { StatusBadge } from '../components/StatusBadge';
import type { CeoDecisionCenterViewModel } from '../modules/ceo-decision-center/ceo-decision-center-dashboard-model';
import { fetchDecisionCenter } from '../modules/ceo-decision-center/ceo-decision-center-api';

type Props = {
  token: string;
  role: string;
};

export function CeoDecisionCenterPage({ token, role }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CeoDecisionCenterViewModel | null>(null);
  const [error, setError] = useState<DashboardApiError | null>(null);

  useEffect(() => {
    if (!token) {
      setError({ code: 'UNAUTHORIZED', message: 'Missing token', status: 401, name: 'DashboardApiError' } as DashboardApiError);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchDecisionCenter({ token, role, signal: controller.signal })
      .then((result) => setData(result))
      .catch((err: DashboardApiError) => setError(err))
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [token, role]);

  if (loading) return <section className="panel"><p>Loading CEO decision center...</p></section>;

  if (error) {
    return (
      <section className="panel" role="alert">
        <h2>Decision Center connection error</h2>
        <p>{messageForApiCode(error.code)}</p>
        <p className="muted">Error category: {error.code}</p>
      </section>
    );
  }

  if (!data) return <section className="panel"><p>No decision center data available.</p></section>;

  return (
    <>
      <div className="card-grid cards-4">
        <SectionCard title="Pending Executive Reviews" status={data.sections.dashboardHealth.status}>
          <p className="metric">{data.approvalQueueCount}</p>
        </SectionCard>
        <SectionCard title="Blocked Missions" status={data.sections.dashboardHealth.status}>
          <p className="metric">{data.blockedMissionCount}</p>
        </SectionCard>
        <SectionCard title="Top Opportunity Value" status="ESTIMATED">
          <p className="metric">{data.topOpportunityValue == null ? 'N/A' : data.topOpportunityValue.toLocaleString()}</p>
        </SectionCard>
        <SectionCard title="Recent Decisions" status={data.sections.dashboardHealth.status}>
          <p className="metric">{data.recentDecisionCount}</p>
        </SectionCard>
      </div>

      <div className="card-grid cards-2">
        <SectionCard title="Pending Executive Reviews" status={data.sections.dashboardHealth.status}>
          <ul>
            {data.sections.executiveReviews.map((review, index) => (
              <li key={`${review.missionId ?? review.customer}_${index}`}>
                <strong>{review.missionId ?? 'UNASSIGNED_MISSION'}</strong> {review.missionType} | {review.customer} | {review.priority} | {review.recommendedAction}
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Blocked Missions" status={data.sections.dashboardHealth.status}>
          <ul>
            {data.sections.blockedMissions.map((mission) => (
              <li key={mission.missionId}>
                <strong>{mission.missionId}</strong> | {mission.reasonBlocked} | owner {mission.responsibleWorker} | waiting {mission.waitingDurationHours ?? 'N/A'}h
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="card-grid cards-2">
        <SectionCard title="High Priority Opportunities" status="ESTIMATED">
          <ul>
            {data.sections.opportunities.map((opportunity, index) => (
              <li key={`${opportunity.opportunity}_${index}`}>
                #{opportunity.recommendedOrder} {opportunity.opportunity} | value {opportunity.expectedValue ?? 'N/A'} | strategic {opportunity.strategicAlignment ?? 'N/A'} | urgency {opportunity.urgency ?? 'N/A'}
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Risk Overview" status={data.sections.dashboardHealth.status}>
          <ul>
            {data.sections.risks.map((risk, index) => (
              <li key={`${risk.title}_${index}`}><StatusBadge status={risk.severity} /> {risk.title}: {risk.detail}</li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="Decision History" status={data.sections.dashboardHealth.status}>
        <ul>
          {data.sections.decisionHistory.map((decision, index) => (
            <li key={`${decision.timestamp}_${index}`}>
              {decision.timestamp} | {decision.decision} | {decision.mission} | {decision.outcome}
            </li>
          ))}
        </ul>
      </SectionCard>

      <section className="panel">
        <h2>Governance</h2>
        <p>Read-only: {String(data.sections.governance.readOnly)}</p>
        <p>Mission execution enabled: {String(data.sections.governance.missionExecutionEnabled)}</p>
        <p>Publish enabled: {String(data.sections.governance.publishEnabled)}</p>
        <p>Deploy enabled: {String(data.sections.governance.deployEnabled)}</p>
      </section>
    </>
  );
}
