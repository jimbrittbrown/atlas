import type { PropsWithChildren } from 'react';
import { StatusBadge } from './StatusBadge';

type SectionCardProps = PropsWithChildren<{
  title: string;
  status?: string;
  subtitle?: string;
}>;

export function SectionCard({ title, status, subtitle, children }: SectionCardProps) {
  return (
    <section className="card" aria-label={title}>
      <header className="card-header">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {status ? <StatusBadge status={status} /> : null}
      </header>
      <div className="card-body">{children}</div>
    </section>
  );
}
