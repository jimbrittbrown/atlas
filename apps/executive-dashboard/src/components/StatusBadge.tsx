import type { DataAvailabilityStatus } from '../api/types';

export function StatusBadge({ status }: { status: DataAvailabilityStatus | string }) {
  const normalized = String(status ?? 'UNKNOWN').toUpperCase();
  return <span className={`badge badge-${normalized.toLowerCase()}`}>{normalized}</span>;
}
