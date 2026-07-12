import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CeoDecisionCenterPage } from '../pages/CeoDecisionCenterPage';

const mockResponse = {
  success: true,
  status: 200,
  requestId: 'req_decision_center',
  timestamp: new Date().toISOString(),
  data: {
    executiveReviews: [{ missionId: 'mis_1', missionType: 'WEBSITE_BUILD', customer: 'Atlas Co', priority: 'HIGH', confidenceScore: 0.8, estimatedValue: 100, recommendedAction: 'APPROVE', availableDecisions: ['APPROVE'], actionType: 'APPROVE_OR_REJECT' }],
    blockedMissions: [{ missionId: 'mis_2', reasonBlocked: 'Dependency', requiredAction: 'UNBLOCK', responsibleWorker: 'worker_1', waitingDurationHours: 12 }],
    opportunities: [{ opportunity: 'Growth', expectedValue: 200, strategicAlignment: 0.9, urgency: 80, confidence: 0.7, recommendedOrder: 1 }],
    risks: [{ title: 'Provider failures', detail: 'None', severity: 'INFO' }],
    decisionHistory: [{ decision: 'APPROVE', timestamp: new Date().toISOString(), mission: 'mis_1', outcome: 'Approved' }],
    dashboardHealth: { status: 'AVAILABLE', generatedAt: new Date().toISOString(), source: 'EXECUTIVE_OPERATIONS_DASHBOARD', limitations: [] },
    governance: { readOnly: true, decisionExecutionEnabled: false, missionExecutionEnabled: false, publishEnabled: false, deployEnabled: false, destructiveActionsEnabled: false },
    apiVersion: 'v1'
  },
  pagination: null,
  dataFreshness: null,
  warnings: [],
  limitations: [],
  error: null
};

describe('CEO decision center page', () => {
  it('renders loaded decision center sections', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => mockResponse }) as unknown as typeof fetch);

    render(<CeoDecisionCenterPage token="token" role="CEO" />);

    await waitFor(() => expect(screen.getAllByText(/Pending Executive Reviews/i).length).toBeGreaterThan(0));
    expect(screen.getByText(/Risk Overview/i)).toBeInTheDocument();
    expect(screen.getByText(/Decision History/i)).toBeInTheDocument();
  });

  it('shows unauthorized state when token is missing', async () => {
    render(<CeoDecisionCenterPage token="" role="CEO" />);
    await waitFor(() => expect(screen.getByText(/Authentication required/i)).toBeInTheDocument());
  });

  it('shows forbidden and rate-limited errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ success: false, status: 403, error: { code: 'FORBIDDEN', message: 'Forbidden request.' } }),
    }) as unknown as typeof fetch);

    render(<CeoDecisionCenterPage token="token" role="OPERATOR" />);
    await waitFor(() => expect(screen.getByText(/does not have access/i)).toBeInTheDocument());
  });
});
