import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CustomerPortalProjectsPage } from '../pages/CustomerPortalProjectsPage';

describe('customer dashboard projects', () => {
  it('loads and renders project cards', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        status: 200,
        requestId: 'req-customer-projects',
        timestamp: new Date().toISOString(),
        data: {
          customerId: 'cus_test',
          account: {
            accountId: 'cpa_test',
            customerId: 'cus_test',
            companyName: 'Customer Dashboard Test',
            email: 'customer@test.example',
            phone: '+1-555-0990',
            createdAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
            stripeCustomerId: null,
            stripeLinkagePlanned: true
          },
          projects: [{
            projectId: 'mis_1',
            missionId: 'mis_1',
            customerId: 'cus_test',
            customerAccount: {
              accountId: 'cpa_test',
              customerId: 'cus_test',
              email: 'customer@test.example',
              stripeCustomerId: null
            },
            projectStatus: 'ACTIVE',
            submittedDate: new Date().toISOString(),
            currentStage: 'INTAKE_ACCEPTED',
            estimatedCompletion: 'PENDING',
            assignedWorkforce: ['Worker A'],
            executiveReviewStatus: 'ACTIVE',
            revisionCount: 0,
            messages: [{ type: 'SYSTEM', text: 'Accepted', createdAt: new Date().toISOString() }],
            percentComplete: 5,
            qaStatus: 'NOT_STARTED',
            blockedIssues: [],
            downloadDeliverables: []
          }]
        },
        pagination: null,
        dataFreshness: null,
        warnings: [],
        limitations: [],
        error: null
      })
    }) as unknown as typeof fetch);

    render(
      <MemoryRouter>
        <CustomerPortalProjectsPage
          token="token-customer"
          customerId="cus_test"
          accountId="cpa_test"
          sessionToken="csn_test.token"
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/My Projects/i)).toBeInTheDocument();
      expect(screen.getByText(/INTAKE_ACCEPTED/i)).toBeInTheDocument();
      expect(screen.getByText(/Track project/i)).toBeInTheDocument();
    });
  });
});
