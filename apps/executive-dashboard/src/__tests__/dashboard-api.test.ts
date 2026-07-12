import { describe, expect, it, vi } from 'vitest';
import { parseDashboardEnvelope } from '../api/validators';
import { dashboardFixtureEnvelope } from '../fixtures/dashboardFixture';
import { fetchDashboardSnapshot, loginCustomerPortal } from '../api/client';

describe('dashboard API boundary', () => {
  it('parses response envelope', () => {
    const parsed = parseDashboardEnvelope(dashboardFixtureEnvelope);
    expect(parsed.success).toBe(true);
    expect(parsed.data.executiveOverview).toBeTruthy();
  });

  it('returns fixture mode only when explicitly selected', async () => {
    const result = await fetchDashboardSnapshot({
      token: 'unused',
      role: 'CEO',
      mode: 'fixture',
    });

    expect(result.sourceLabel).toBe('DEVELOPMENT_DATA');
    expect(result.envelope.warnings.join(' ')).toContain('DEVELOPMENT DATA');
  });

  it('normalizes unauthorized errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        success: false,
        status: 401,
        requestId: 'req1',
        timestamp: new Date().toISOString(),
        data: null,
        pagination: null,
        dataFreshness: null,
        warnings: [],
        limitations: [],
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized request.' },
      }),
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    await expect(fetchDashboardSnapshot({ token: 'bad', role: 'CEO', mode: 'live' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    });
  });

  it('normalizes forbidden and rate limit errors', async () => {
    const responses = [
      {
        ok: false,
        status: 403,
        json: async () => ({ success: false, status: 403, requestId: 'r1', timestamp: '', data: null, pagination: null, dataFreshness: null, warnings: [], limitations: [], error: { code: 'FORBIDDEN', message: 'x' } }),
      },
      {
        ok: false,
        status: 429,
        json: async () => ({ success: false, status: 429, requestId: 'r2', timestamp: '', data: null, pagination: null, dataFreshness: null, warnings: [], limitations: [], error: { code: 'RATE_LIMITED', message: 'x' } }),
      },
    ];

    const fetchMock = vi.fn().mockImplementation(async () => responses.shift());
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    await expect(fetchDashboardSnapshot({ token: 'x', role: 'CEO', mode: 'live' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(fetchDashboardSnapshot({ token: 'x', role: 'CEO', mode: 'live' })).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('handles network failures without leaking secrets', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('token=supersecret')) as unknown as typeof fetch);

    await expect(fetchDashboardSnapshot({ token: 'supersecret', role: 'CEO', mode: 'live' })).rejects.toMatchObject({
      code: 'NETWORK_FAILURE',
      message: 'Unable to reach Atlas dashboard API.',
    });
  });

  it('uses read-only GET request path', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => dashboardFixtureEnvelope,
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    await fetchDashboardSnapshot({ token: 'token', role: 'CEO', mode: 'live' });
    const [, options] = fetchMock.mock.calls[0];
    expect(options.method).toBe('GET');
  });

  it('sends credentials and CSRF header for mutating customer requests', async () => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => 'atlas_customer_csrf=csrf_token_1234567890123456789012345678901234567890A',
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        status: 200,
        requestId: 'r-csrf',
        timestamp: new Date().toISOString(),
        data: {
          customerId: 'cus_1',
          accountStatus: 'ACTIVE',
          sessionId: 'csn_1',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          idleExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          absoluteExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
        pagination: null,
        dataFreshness: null,
        warnings: [],
        limitations: [],
        error: null,
      }),
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    await loginCustomerPortal({ email: 'customer@example.com', password: 'atlas-pass-1234' }, {});
    const [, options] = fetchMock.mock.calls[0];
    expect(options.credentials).toBe('include');
    expect(options.headers['x-atlas-csrf-token']).toBe('csrf_token_1234567890123456789012345678901234567890A');
  });
});
