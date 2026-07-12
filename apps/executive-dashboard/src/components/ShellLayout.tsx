import { NavLink, Outlet } from 'react-router-dom';
import { navigationItems } from '../config';

type ShellProps = {
  connectionLabel: string;
  statusLine: string;
  onOpenSettings: () => void;
};

export function ShellLayout({ connectionLabel, statusLine, onOpenSettings }: ShellProps) {
  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Atlas CEO navigation">
        <h1 className="brand">Atlas CEO Dashboard</h1>
        <nav aria-label="Atlas CEO navigation">
          <ul className="nav-list">
            {navigationItems.map((item) => (
              <li key={item.key}>
                <NavLink to={item.path} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="content-frame">
        <header className="topbar">
          <div>
            <p className="topbar-kicker">Executive Operations</p>
            <p className="topbar-title">Operational Read Model</p>
          </div>
          <div className="topbar-right">
            <span className="source-pill">{connectionLabel}</span>
            <button type="button" onClick={onOpenSettings}>Connection Settings</button>
          </div>
        </header>

        <div className="status-line" role="status" aria-live="polite">{statusLine}</div>
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
