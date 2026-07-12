import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { approveCustomerCompletion, fetchCustomerDownloads, fetchCustomerProject, requestCustomerRevision } from '../api/client';
import type { CustomerDownloadsResponse, CustomerProjectRecord } from '../api/types';
import { DashboardApiError } from '../api/errors';
import { SectionCard } from '../components/SectionCard';

type CustomerProjectTrackingPageProps = {
  token?: string;
  customerId: string;
  accountId: string;
  sessionToken?: string;
};

export function CustomerProjectTrackingPage({ token, customerId, accountId, sessionToken }: CustomerProjectTrackingPageProps) {
  const { projectId } = useParams();
  const [project, setProject] = useState<CustomerProjectRecord | null>(null);
  const [downloads, setDownloads] = useState<CustomerDownloadsResponse | null>(null);
  const [error, setError] = useState<DashboardApiError | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId || !customerId) return;

    setLoading(true);
    setError(null);

    Promise.all([
      fetchCustomerProject(projectId, { token, customerId, accountId, sessionToken }),
      fetchCustomerDownloads(projectId, { token, customerId, accountId, sessionToken })
    ])
      .then(([projectResponse, downloadResponse]) => {
        setProject(projectResponse);
        setDownloads(downloadResponse);
      })
      .catch((err: DashboardApiError) => setError(err))
      .finally(() => setLoading(false));
  }, [projectId, token, customerId, accountId, sessionToken]);

  const onRequestRevision = async () => {
    if (!projectId) return;
    const reason = window.prompt('Revision reason', 'Customer requested design refinement');
    if (!reason) return;

    try {
      await requestCustomerRevision({ missionId: projectId, reason }, { token, customerId, accountId, sessionToken });
      const refreshed = await fetchCustomerProject(projectId, { token, customerId, accountId, sessionToken });
      setProject(refreshed);
    } catch (err) {
      setError(err as DashboardApiError);
    }
  };

  const onApproveCompletion = async () => {
    if (!projectId) return;
    try {
      await approveCustomerCompletion({ missionId: projectId }, { token, customerId, accountId, sessionToken });
      const refreshed = await fetchCustomerProject(projectId, { token, customerId, accountId, sessionToken });
      setProject(refreshed);
    } catch (err) {
      setError(err as DashboardApiError);
    }
  };

  if (loading) {
    return <section className="panel"><p>Loading mission tracking...</p></section>;
  }

  if (error) {
    return (
      <section className="panel" role="alert">
        <h2>Tracking unavailable</h2>
        <p>{error.message}</p>
      </section>
    );
  }

  if (!project) {
    return <section className="panel"><p>No project selected.</p></section>;
  }

  return (
    <>
      <section className="panel">
        <h2>Mission Tracking</h2>
        <p>Mission ID: {project.missionId}</p>
        <p>Current Stage: {project.currentStage}</p>
        <p>Percent Complete: {project.percentComplete}%</p>
      </section>

      <div className="card-grid cards-2">
        <SectionCard title="Live Status" status={project.projectStatus}>
          <p>Worker Assigned: {project.assignedWorkforce.length > 0 ? project.assignedWorkforce.join(', ') : 'Pending'}</p>
          <p>Executive Review: {project.executiveReviewStatus}</p>
          <p>QA Status: {project.qaStatus}</p>
          <p>Blocked Issues: {project.blockedIssues.length > 0 ? project.blockedIssues.join(' | ') : 'None'}</p>
          <p>Estimated Finish: {project.estimatedCompletion ?? 'Pending estimate'}</p>
          <p>QA Score: {project.qaResults?.score ?? 0}</p>
          <p>QA Issues Remaining: {project.qaResults?.issuesRemaining ?? 0}</p>
          <button type="button" onClick={onRequestRevision}>Request Revision</button>
          <button type="button" onClick={onApproveCompletion}>Approve Completion</button>
        </SectionCard>

        <SectionCard title="Downloads" status="AVAILABLE">
          {downloads?.downloads?.length ? (
            <ul>
              {downloads.downloads.map((item) => (
                <li key={item.key}>{item.label}: {item.path} ({item.available ? 'available' : 'pending'})</li>
              ))}
            </ul>
          ) : <p>No download references yet.</p>}
        </SectionCard>
      </div>

      <div className="card-grid cards-2">
        <SectionCard title="Timeline" status="AVAILABLE">
          {(project.timeline ?? []).length > 0 ? (
            <ul>
              {project.timeline?.map((entry, index) => (
                <li key={`${entry.event}_${index}`}>{entry.event}: {new Date(entry.at).toLocaleString()} - {entry.details}</li>
              ))}
            </ul>
          ) : <p>Timeline is building from mission activity.</p>}
        </SectionCard>

        <SectionCard title="Files and Invoices" status="PARTIAL">
          <p>Files</p>
          <ul>
            {(project.files ?? []).map((item) => (
              <li key={item.key}>{item.label}: {item.path} ({item.available ? 'available' : 'pending'})</li>
            ))}
          </ul>
          <p>Invoices</p>
          <ul>
            {(project.invoices ?? []).map((invoice) => (
              <li key={invoice.invoiceId}>{invoice.invoiceId}: {invoice.status}</li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </>
  );
}
