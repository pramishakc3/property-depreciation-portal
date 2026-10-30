import { STATUS_LABELS, type JobStatus } from '@pdp/shared';

export function StatusBadge({ status }: { status: JobStatus }) {
  return <span className={`badge status-${status}`}>{STATUS_LABELS[status]}</span>;
}
