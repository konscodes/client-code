// Status pill component for order statuses
import type { OrderStatus } from '../lib/types';

interface StatusPillProps {
  status: OrderStatus;
}

const statusConfig: Record<OrderStatus, { label: string; className: string }> = {
  'draft': {
    label: 'Draft',
    className: 'bg-[#F2F4F4] text-[#7C8085]',
  },
  'approved': {
    label: 'Approved',
    className: 'bg-[#E8F5E9] text-[#2E7D32]',
  },
  'in-progress': {
    label: 'In Progress',
    className: 'bg-[#E3F2FD] text-[#1976D2]',
  },
  'completed': {
    label: 'Completed',
    className: 'bg-[#E8F5E9] text-[#1F744F]',
  },
  'billed': {
    label: 'Billed',
    className: 'bg-[#E8F5E9] text-[#388E3C]',
  },
};

export function StatusPill({ status }: StatusPillProps) {
  const config = statusConfig[status];
  
  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-md ${config.className}`}
      role="status"
      aria-label={`Status: ${config.label}`}
    >
      {config.label}
    </span>
  );
}
