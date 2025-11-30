// Status pill component for order statuses
import { useTranslation } from 'react-i18next';
import type { OrderStatus } from '../lib/types';

interface StatusPillProps {
  status: OrderStatus;
}

const statusConfig: Record<OrderStatus, { className: string }> = {
  'draft': {
    className: 'bg-[#F2F4F4] text-[#7C8085]',
  },
  'approved': {
    className: 'bg-[#E8F5E9] text-[#2E7D32]',
  },
  'in-progress': {
    className: 'bg-[#E3F2FD] text-[#1976D2]',
  },
  'completed': {
    className: 'bg-[#E8F5E9] text-[#1F744F]',
  },
  'billed': {
    className: 'bg-[#E8F5E9] text-[#388E3C]',
  },
};

export function StatusPill({ status }: StatusPillProps) {
  const { t } = useTranslation();
  const config = statusConfig[status];
  const label = t(`orders.${status === 'in-progress' ? 'inProgress' : status}`);
  
  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-md ${config.className}`}
      role="status"
      aria-label={`${t('orders.status')}: ${label}`}
    >
      {label}
    </span>
  );
}
