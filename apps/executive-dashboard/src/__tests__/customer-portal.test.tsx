import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardRoutes } from '../App';

describe('customer portal route foundation', () => {
  it('renders new website request route', async () => {
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
            totalMissions: 1,
            activeMissions: 1,
            blockedMissions: 0,
            missionsAwaitingCeoReview: 0,
            currentPortfolioValue: 1,
            averageConfidenceScore: 0.5,
            averageRiskScore: 0.5,
            systemHealthSummary: 'ok',
            dataAvailability: 'AVAILABLE',
            generatedTimestamp: new Date().toISOString()
          },
          missionControl: { records: [] },
          workforce: { utilization: 0.5, status: 'AVAILABLE', workerDetails: [] },
          customerPipeline: { status: 'AVAILABLE', totalCustomers: 1 },
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
      <MemoryRouter initialEntries={['/portal/new-request']}>
        <DashboardRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: /New Website Request/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Business Name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Website Request/i })).toBeInTheDocument();
  });
});
