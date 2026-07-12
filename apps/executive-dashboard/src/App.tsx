import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ShellLayout } from './components/ShellLayout';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { ExecutiveOverviewPage } from './pages/ExecutiveOverviewPage';
import { CeoDecisionCenterPage } from './pages/CeoDecisionCenterPage';
import { CustomerPortalProjectsPage } from './pages/CustomerPortalProjectsPage';
import { NewWebsiteRequestPage } from './pages/NewWebsiteRequestPage';
import { CustomerProjectTrackingPage } from './pages/CustomerProjectTrackingPage';
import { CustomerLoginPage } from './pages/CustomerLoginPage';
import { AtlasWebsiteStudioPage } from './pages/AtlasWebsiteStudioPage';
import { appConfig } from './config';
import { useDashboardOverview } from './hooks/useDashboardOverview';
import { clearCustomerCsrfCookie, getCurrentCustomerSession, logoutCustomerPortal } from './api/client';

function DashboardRoutes() {
  const [token, setToken] = useState<string>(() => sessionStorage.getItem('atlas.dashboard.token') ?? '');
  const [role, setRole] = useState<string>(() => sessionStorage.getItem('atlas.dashboard.role') ?? appConfig.defaultRole);
  const [customerId, setCustomerId] = useState<string>(() => sessionStorage.getItem('atlas.customer.id') ?? '');
  const [customerAccountId, setCustomerAccountId] = useState<string>(() => sessionStorage.getItem('atlas.customer.accountId') ?? '');
  const [customerSessionToken, setCustomerSessionToken] = useState<string>(() => {
    if (!appConfig.customerSessionHeaderTransportEnabled) return '';
    return sessionStorage.getItem('atlas.customer.sessionToken') ?? '';
  });
  const [customerSessionId, setCustomerSessionId] = useState<string>(() => sessionStorage.getItem('atlas.customer.sessionId') ?? '');
  const [mode, setMode] = useState<'live' | 'fixture'>(() => {
    if (appConfig.fixtureModeEnabled && sessionStorage.getItem('atlas.dashboard.mode') === 'fixture') return 'fixture';
    return 'live';
  });

  const query = useDashboardOverview(token, role, mode);

  useEffect(() => {
    getCurrentCustomerSession({
      token: token || undefined,
      customerId: customerId || undefined,
      accountId: customerAccountId || undefined,
      sessionToken: customerSessionToken || undefined
    })
      .then((session) => {
        setCustomerId(session.customerId);
        setCustomerAccountId((prev) => prev || 'ACTIVE_SESSION');
        setCustomerSessionId(session.sessionId);
        sessionStorage.setItem('atlas.customer.id', session.customerId);
        sessionStorage.setItem('atlas.customer.accountId', 'ACTIVE_SESSION');
        sessionStorage.setItem('atlas.customer.sessionId', session.sessionId);
      })
      .catch(() => {
        setCustomerId('');
        setCustomerAccountId('');
        setCustomerSessionToken('');
        setCustomerSessionId('');
        sessionStorage.removeItem('atlas.customer.id');
        sessionStorage.removeItem('atlas.customer.accountId');
        sessionStorage.removeItem('atlas.customer.sessionId');
        sessionStorage.removeItem('atlas.customer.sessionToken');
        clearCustomerCsrfCookie();
      });
  }, []);

  const clearCustomerState = () => {
    setCustomerId('');
    setCustomerAccountId('');
    setCustomerSessionToken('');
    setCustomerSessionId('');
    sessionStorage.removeItem('atlas.customer.id');
    sessionStorage.removeItem('atlas.customer.accountId');
    sessionStorage.removeItem('atlas.customer.sessionToken');
    sessionStorage.removeItem('atlas.customer.sessionId');
    clearCustomerCsrfCookie();
  };

  const handleCustomerSignOut = async () => {
    try {
      await logoutCustomerPortal({
        token: token || undefined,
        customerId: customerId || undefined,
        accountId: customerAccountId || undefined,
        sessionToken: customerSessionToken || undefined
      });
    } catch {
      // Best effort logout: always clear local customer context.
    } finally {
      clearCustomerState();
    }
  };

  const connectionLabel = mode === 'fixture' ? 'DEVELOPMENT DATA' : 'LIVE API';
  const statusLine = useMemo(() => {
    if (query.loading) return 'Loading executive snapshot...';
    if (query.error) return `Connection issue: ${query.error.code}`;
    if (query.result) return `Snapshot request: ${query.result.envelope.requestId}`;
    return 'No snapshot loaded.';
  }, [query.loading, query.error, query.result]);

  const openSettings = () => {
    const nextToken = window.prompt('Enter dashboard API token (kept in this browser session only):', token);
    if (nextToken != null) {
      setToken(nextToken.trim());
      sessionStorage.setItem('atlas.dashboard.token', nextToken.trim());
    }

    const nextRole = window.prompt('Enter dashboard role (CEO/EXECUTIVE/OPERATOR/AUDITOR/READ_ONLY_SERVICE):', role);
    if (nextRole != null) {
      const normalized = nextRole.trim().toUpperCase();
      setRole(normalized);
      sessionStorage.setItem('atlas.dashboard.role', normalized);
    }

    if (appConfig.fixtureModeEnabled) {
      const useFixture = window.confirm('Enable DEVELOPMENT DATA mode? Cancel keeps LIVE API mode.');
      const nextMode = useFixture ? 'fixture' : 'live';
      setMode(nextMode);
      sessionStorage.setItem('atlas.dashboard.mode', nextMode);
    }
  };

  return (
    <Routes>
      <Route path="/" element={<ShellLayout connectionLabel={connectionLabel} statusLine={statusLine} onOpenSettings={openSettings} />}>
        <Route
          index
          element={(
            <ExecutiveOverviewPage
              loading={query.loading}
              result={query.result}
              error={query.error ? { code: query.error.code, message: query.error.message } : null}
              isStale={query.isStale}
              staleMinutes={query.staleMinutes}
            />
          )}
        />
        <Route path="decisions" element={<CeoDecisionCenterPage token={token} role={role} />} />
        <Route path="missions" element={<ComingSoonPage label="Mission Control" />} />
        <Route path="customers" element={<ComingSoonPage label="Customers" />} />
        <Route path="opportunities" element={<ComingSoonPage label="Opportunities" />} />
        <Route path="workforce" element={<ComingSoonPage label="Workforce" />} />
        <Route path="providers" element={<ComingSoonPage label="Providers" />} />
        <Route path="system-health" element={<ComingSoonPage label="System Health" />} />
        <Route path="activity" element={<ComingSoonPage label="Activity" />} />
        <Route path="portal/projects" element={<CustomerPortalProjectsPage token={token} customerId={customerId} accountId={customerAccountId} sessionToken={customerSessionToken} />} />
        <Route path="portal/login" element={<CustomerLoginPage token={token} onAuthenticated={({ customerId: nextCustomerId, sessionToken, sessionId }) => {
          setCustomerId(nextCustomerId);
          setCustomerAccountId('ACTIVE_SESSION');
          setCustomerSessionToken(sessionToken ?? '');
          setCustomerSessionId(sessionId);
          sessionStorage.setItem('atlas.customer.id', nextCustomerId);
          sessionStorage.setItem('atlas.customer.accountId', 'ACTIVE_SESSION');
          if (appConfig.customerSessionHeaderTransportEnabled && sessionToken) {
            sessionStorage.setItem('atlas.customer.sessionToken', sessionToken);
          } else {
            sessionStorage.removeItem('atlas.customer.sessionToken');
          }
          sessionStorage.setItem('atlas.customer.sessionId', sessionId);
        }} onSignOut={handleCustomerSignOut} />} />
        <Route path="portal/new-request" element={<NewWebsiteRequestPage token={token} customerId={customerId} accountId={customerAccountId} sessionToken={customerSessionToken} />} />
        <Route path="portal/project/:projectId" element={<CustomerProjectTrackingPage token={token} customerId={customerId} accountId={customerAccountId} sessionToken={customerSessionToken} />} />
        <Route path="studio" element={<AtlasWebsiteStudioPage section="home" result={query.result} />} />
        <Route path="studio/services" element={<AtlasWebsiteStudioPage section="services" result={query.result} />} />
        <Route path="studio/portfolio" element={<AtlasWebsiteStudioPage section="portfolio" result={query.result} />} />
        <Route path="studio/pricing" element={<AtlasWebsiteStudioPage section="pricing" result={query.result} />} />
        <Route path="studio/process" element={<AtlasWebsiteStudioPage section="process" result={query.result} />} />
        <Route path="studio/faq" element={<AtlasWebsiteStudioPage section="faq" result={query.result} />} />
        <Route path="studio/contact" element={<AtlasWebsiteStudioPage section="contact" result={query.result} />} />
        <Route path="settings" element={<ComingSoonPage label="Settings" />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <DashboardRoutes />
    </BrowserRouter>
  );
}

export { DashboardRoutes };
