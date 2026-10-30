import { Link } from 'react-router-dom';

export function Brand({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="brand">
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="#0f4c5c" />
        <path d="M7 23V13l9-6 9 6v10h-6v-6h-6v6z" fill="#f2b134" />
      </svg>
      <span>Depreciation Portal</span>
    </Link>
  );
}
