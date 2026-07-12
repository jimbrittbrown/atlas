import { Link } from 'react-router-dom';
import type { DashboardQueryResult } from '../api/types';

type AtlasWebsiteStudioPageProps = {
  section: 'home' | 'services' | 'portfolio' | 'pricing' | 'process' | 'faq' | 'contact';
  result: DashboardQueryResult | null;
};

const studioNav = [
  { path: '/studio', label: 'Home', section: 'home' },
  { path: '/studio/services', label: 'Services', section: 'services' },
  { path: '/studio/portfolio', label: 'Portfolio', section: 'portfolio' },
  { path: '/studio/pricing', label: 'Pricing', section: 'pricing' },
  { path: '/studio/process', label: 'Process', section: 'process' },
  { path: '/studio/faq', label: 'FAQ', section: 'faq' },
  { path: '/studio/contact', label: 'Contact', section: 'contact' },
] as const;

function sectionTitle(section: AtlasWebsiteStudioPageProps['section']) {
  const map = {
    home: 'Atlas Website Studio',
    services: 'Services',
    portfolio: 'Portfolio',
    pricing: 'Pricing',
    process: 'Process',
    faq: 'FAQ',
    contact: 'Contact',
  };
  return map[section];
}

export function AtlasWebsiteStudioPage({ section, result }: AtlasWebsiteStudioPageProps) {
  const snapshot = result?.envelope?.data;
  const launch = snapshot?.websiteBusinessLaunch;
  const projects = snapshot?.missionControl?.records ?? [];

  return (
    <div className="studio-site">
      <header className="studio-hero">
        <p className="eyebrow">Atlas Website Studio</p>
        <h1>{sectionTitle(section)}</h1>
        <p>Business-grade website execution with governance-first delivery and CEO approval checkpoints.</p>
        <div className="studio-metrics">
          <article>
            <h3>Website Projects</h3>
            <p>{launch?.websiteProjects ?? projects.length ?? 0}</p>
          </article>
          <article>
            <h3>Revenue Pipeline (Est.)</h3>
            <p>{Number(launch?.revenuePipelineEstimated ?? snapshot?.executiveOverview?.currentPortfolioValue ?? 0).toLocaleString()}</p>
          </article>
          <article>
            <h3>Awaiting Approval</h3>
            <p>{launch?.projectsAwaitingApproval ?? snapshot?.executiveOverview?.missionsAwaitingCeoReview ?? 0}</p>
          </article>
        </div>
      </header>

      <nav className="studio-nav" aria-label="Atlas Website Studio pages">
        {studioNav.map((item) => (
          <Link key={item.path} className={item.section === section ? 'active' : ''} to={item.path}>{item.label}</Link>
        ))}
      </nav>

      <main className="studio-content">
        {section === 'home' ? (
          <section className="studio-panel">
            <h2>Build. QA. Deliver.</h2>
            <p>Atlas turns mission intake into production-ready websites with integrated QA, revision cycles, and customer delivery packages.</p>
          </section>
        ) : null}

        {section === 'services' ? (
          <section className="studio-panel">
            <h2>Services</h2>
            <ul>
              <li>Website Strategy and IA</li>
              <li>Brand-Constrained Design and Build</li>
              <li>Production QA and Revision Management</li>
              <li>Customer Portal Tracking and Delivery</li>
            </ul>
          </section>
        ) : null}

        {section === 'portfolio' ? (
          <section className="studio-panel">
            <h2>Portfolio</h2>
            <p>Live mission snapshots sourced from Mission Control.</p>
            <ul>
              {projects.slice(0, 6).map((project) => (
                <li key={project.missionId}>{project.customer} - {project.currentState} ({project.ceoReviewStatus})</li>
              ))}
            </ul>
          </section>
        ) : null}

        {section === 'pricing' ? (
          <section className="studio-panel">
            <h2>Pricing</h2>
            <p>Estimated portfolio value is sourced from executive opportunity projections and treated as non-recognized revenue.</p>
            <p>Current estimated pipeline: {Number(snapshot?.executiveOverview?.currentPortfolioValue ?? 0).toLocaleString()}</p>
          </section>
        ) : null}

        {section === 'process' ? (
          <section className="studio-panel">
            <h2>Process</h2>
            <ol>
              <li>Lead Intake into Mission Control</li>
              <li>Mission Orchestration and Workforce Assignment</li>
              <li>Website Production QA and Revision Cycle</li>
              <li>Customer Delivery Package and CEO Approval Gate</li>
            </ol>
          </section>
        ) : null}

        {section === 'faq' ? (
          <section className="studio-panel">
            <h2>FAQ</h2>
            <h3>Do you auto-publish websites?</h3>
            <p>No. Atlas preserves governance: no publish/deploy/destructive operations in this stack.</p>
            <h3>How are revisions handled?</h3>
            <p>Revisions are routed as explicit mission-linked requests and tracked in the customer dashboard.</p>
          </section>
        ) : null}

        {section === 'contact' ? (
          <section className="studio-panel">
            <h2>Contact</h2>
            <p>Start your request through the integrated intake form.</p>
            <p><Link to="/portal/new-request">Request a Website</Link></p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
