import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { SectionCard } from '../components/SectionCard';
import { StatusBadge } from '../components/StatusBadge';
import { fetchCustomerProjects } from '../api/client';
import type { CustomerProjectsResponse } from '../api/types';
import { DashboardApiError } from '../api/errors';

type CustomerPortalProjectsPageProps = {
  token?: string;
  customerId: string;
  accountId: string;
  sessionToken?: string;
};

export function CustomerPortalProjectsPage({ token, customerId, accountId, sessionToken }: CustomerPortalProjectsPageProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CustomerProjectsResponse | null>(null);
  const [error, setError] = useState<DashboardApiError | null>(null);

  useEffect(() => {
    if (!customerId) return;

    setLoading(true);
    setError(null);

    fetchCustomerProjects({ token, customerId, accountId, sessionToken })
      .then((response) => setData(response))
      .catch((err: DashboardApiError) => setError(err))
      .finally(() => setLoading(false));
  }, [token, customerId, accountId, sessionToken]);

  if (!customerId) {
    return (
      <section className="panel" role="alert">
        <h2>Customer Authentication Required</h2>
        <p>Sign in through Customer Authentication to load your projects.</p>
      </section>
    );
  }

  if (loading) {
    return <section className="panel"><p>Loading customer projects...</p></section>;
  }

  if (error) {
    return (
      <section className="panel" role="alert">
        <h2>Unable to load customer projects</h2>
        <p>{error.message}</p>
      </section>
    );
  }

  if (!data || data.projects.length === 0) {
    return (
      <section className="panel">
        <h2>My Projects</h2>
        <p>No website projects found yet.</p>
        <p><Link to="/portal/new-request">Submit your first website request.</Link></p>
      </section>
    );
  }

  return (
    <>
      <section className="panel">
        <h2>My Projects</h2>
        <p>Customer Account: {data.account?.accountId ?? 'UNASSIGNED'} | Stripe Link: planned</p>
      </section>

      <div className="card-grid cards-2">
        {data.projects.map((project) => (
          <SectionCard
            key={project.projectId}
            title={project.projectId}
            status={project.projectStatus}
            subtitle={`Submitted ${new Date(project.submittedDate).toLocaleString()}`}
          >
            <p>Current Stage: {project.currentStage}</p>
            <p>Estimated Completion: {project.estimatedCompletion ?? 'Pending'}</p>
            <p>Assigned Workforce: {project.assignedWorkforce.length > 0 ? project.assignedWorkforce.join(', ') : 'Pending'}</p>
            <p>Executive Review: <StatusBadge status={project.executiveReviewStatus} /></p>
            <p>Revision Count: {project.revisionCount}</p>
            <p>Messages: {project.messages.length}</p>
            <p>Downloads: {project.downloadDeliverables.length}</p>
            <p><Link to={`/portal/project/${project.projectId}`}>Track project</Link></p>
          </SectionCard>
        ))}
      </div>
    </>
  );
}
