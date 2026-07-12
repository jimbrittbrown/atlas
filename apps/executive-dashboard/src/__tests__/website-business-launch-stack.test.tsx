import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { DashboardRoutes } from '../App';

describe('website business launch stack frontend routes', () => {
  it('renders public studio portfolio page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        status: 200,
        requestId: 'req-fixture',
        timestamp: new Date().toISOString(),
        data: {
          executiveOverview: {
            totalCustomers: 1,
            totalMissions: 2,
            activeMissions: 2,
            blockedMissions: 0,
            missionsAwaitingCeoReview: 1,
            currentPortfolioValue: 220000,
            averageConfidenceScore: 0.7,
            averageRiskScore: 0.4,
            systemHealthSummary: 'ok',
            dataAvailability: 'AVAILABLE',
            generatedTimestamp: new Date().toISOString()
          },
          missionControl: {
            records: [
              {
                missionId: 'mis_1',
                customer: 'Atlas Studio Client',
                currentState: 'ACTIVE',
                blockingIssues: [],
                ceoReviewStatus: 'AWAITING_CEO_APPROVAL'
              }
            ]
          },
          workforce: { utilization: 0.5, status: 'AVAILABLE', workerDetails: [] },
          customerPipeline: { status: 'AVAILABLE', totalCustomers: 1 },
          opportunityPortfolio: { status: 'AVAILABLE', rows: [] },
          websiteBusinessLaunch: {
            status: 'AVAILABLE',
            newLeads: 4,
            activeCustomers: 1,
            websiteProjects: 2,
            revenuePipelineEstimated: 220000,
            projectsAwaitingApproval: 1,
            revisionQueue: 1,
            customerSatisfaction: {
              status: 'PLACEHOLDER',
              score: null,
              note: 'planned'
            }
          },
          providerHealth: { status: 'AVAILABLE', providers: [] },
          systemHealth: { status: 'AVAILABLE', summary: 'ok' },
          alerts: { alerts: [] },
          activityFeed: { events: [] },
          generatedAt: new Date().toISOString(),
          dataFreshness: [],
          missingData: [],
          limitations: [],
          recommendedExecutiveActions: [],
          dashboardStatus: 'AVAILABLE'
        },
        pagination: null,
        dataFreshness: [],
        warnings: [],
        limitations: [],
        error: null
      })
    }) as unknown as typeof fetch);

    sessionStorage.setItem('atlas.dashboard.token', 'token-customer');
    sessionStorage.setItem('atlas.dashboard.role', 'CUSTOMER');

    render(
      <MemoryRouter initialEntries={['/studio/portfolio']}>
        <DashboardRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Portfolio', level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/Atlas Studio Client/i)).toBeInTheDocument();
  });

  it('renders customer login route', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        status: 200,
        requestId: 'req-fixture-login',
        timestamp: new Date().toISOString(),
        data: {
          executiveOverview: {
            totalCustomers: 0,
            totalMissions: 0,
            activeMissions: 0,
            blockedMissions: 0,
            missionsAwaitingCeoReview: 0,
            currentPortfolioValue: 0,
            averageConfidenceScore: 0.5,
            averageRiskScore: 0.5,
            systemHealthSummary: 'ok',
            dataAvailability: 'AVAILABLE',
            generatedTimestamp: new Date().toISOString()
          },
          missionControl: { records: [] },
          workforce: { utilization: 0.5, status: 'AVAILABLE', workerDetails: [] },
          customerPipeline: { status: 'AVAILABLE', totalCustomers: 0 },
          opportunityPortfolio: { status: 'AVAILABLE', rows: [] },
          providerHealth: { status: 'AVAILABLE', providers: [] },
          systemHealth: { status: 'AVAILABLE', summary: 'ok' },
          alerts: { alerts: [] },
          activityFeed: { events: [] },
          generatedAt: new Date().toISOString(),
          dataFreshness: [],
          missingData: [],
          limitations: [],
          recommendedExecutiveActions: [],
          dashboardStatus: 'AVAILABLE'
        },
        pagination: null,
        dataFreshness: [],
        warnings: [],
        limitations: [],
        error: null
      })
    }) as unknown as typeof fetch);

    sessionStorage.setItem('atlas.dashboard.token', 'token-customer');
    sessionStorage.setItem('atlas.dashboard.role', 'CUSTOMER');

    render(
      <MemoryRouter initialEntries={['/portal/login']}>
        <DashboardRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: /Customer Login/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Login/i })).toBeInTheDocument();
  });
});
