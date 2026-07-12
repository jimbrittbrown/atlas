import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExecutiveOverviewPage } from '../pages/ExecutiveOverviewPage';
import { dashboardFixtureEnvelope } from '../fixtures/dashboardFixture';

describe('executive overview page', () => {
  it('renders loading state', () => {
    render(<ExecutiveOverviewPage loading result={null} error={null} isStale={false} staleMinutes={null} />);
    expect(screen.getByText(/Loading executive dashboard snapshot/i)).toBeInTheDocument();
  });

  it('renders unavailable and empty state details', () => {
    render(
      <ExecutiveOverviewPage
        loading={false}
        result={{ mode: 'fixture', sourceLabel: 'DEVELOPMENT_DATA', envelope: dashboardFixtureEnvelope }}
        error={null}
        isStale={false}
        staleMinutes={null}
      />,
    );

    expect(screen.getByText(/DEVELOPMENT DATA MODE/i)).toBeInTheDocument();
    expect(screen.getByText(/No active alerts|WARNING:/i)).toBeInTheDocument();
    expect(screen.getByText(/pipeline value estimate/i)).toBeInTheDocument();
  });

  it('renders stale warning and missing data indicators', () => {
    const stale = structuredClone(dashboardFixtureEnvelope);
    stale.data.generatedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    stale.data.missingData = ['Mission Control adapter is not connected.'];

    render(
      <ExecutiveOverviewPage
        loading={false}
        result={{ mode: 'fixture', sourceLabel: 'DEVELOPMENT_DATA', envelope: stale }}
        error={null}
        isStale
        staleMinutes={60}
      />,
    );

    expect(screen.getByText(/Snapshot appears stale/i)).toBeInTheDocument();
    expect(screen.getByText(/Mission Control adapter is not connected/i)).toBeInTheDocument();
  });

  it('renders unauthorized, forbidden, and rate-limited states safely', () => {
    const { rerender } = render(
      <ExecutiveOverviewPage
        loading={false}
        result={null}
        error={{ code: 'UNAUTHORIZED', message: 'Unauthorized request.' }}
        isStale={false}
        staleMinutes={null}
      />,
    );
    expect(screen.getByText(/Authentication required/i)).toBeInTheDocument();

    rerender(
      <ExecutiveOverviewPage
        loading={false}
        result={null}
        error={{ code: 'FORBIDDEN', message: 'Forbidden request.' }}
        isStale={false}
        staleMinutes={null}
      />,
    );
    expect(screen.getByText(/does not have access/i)).toBeInTheDocument();

    rerender(
      <ExecutiveOverviewPage
        loading={false}
        result={null}
        error={{ code: 'RATE_LIMITED', message: 'rate' }}
        isStale={false}
        staleMinutes={null}
      />,
    );
    expect(screen.getByText(/rate limit/i)).toBeInTheDocument();
  });

  it('has accessibility-critical labels', () => {
    render(
      <ExecutiveOverviewPage
        loading={false}
        result={{ mode: 'fixture', sourceLabel: 'DEVELOPMENT_DATA', envelope: dashboardFixtureEnvelope }}
        error={null}
        isStale={false}
        staleMinutes={null}
      />,
    );

    expect(screen.getByRole('region', { name: 'Active Missions' })).toBeInTheDocument();
    expect(screen.getByText(/Data Integrity/)).toBeInTheDocument();
  });
});
