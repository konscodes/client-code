// Status pill component for order statuses
import { useTranslation } from 'react-i18next';
import { logger } from '../lib/logger';
import type { OrderStatus } from '../lib/types';

interface StatusPillProps {
  status: OrderStatus;
}

const statusConfig: Record<OrderStatus, { className: string; style?: React.CSSProperties }> = {
  'proposal': {
    className: 'bg-[#F2F4F4] text-[#7C8085] font-medium',
  },
  'in-progress': {
    className: 'bg-[#E3F2FD] text-[#1976D2] font-medium',
  },
  'completed': {
    className: 'bg-[#E8F5E9] text-[#1F744F] font-medium',
  },
  'canceled': {
    className: 'font-medium',
    style: { backgroundColor: '#FFEBEE', color: '#C62828' },
  },
};

export function StatusPill({ status }: StatusPillProps) {
  const { t } = useTranslation();
  const config = statusConfig[status];
  
  // Fallback to default styling if config is missing
  if (!config) {
    logger.warn(`StatusPill: Missing config for status "${status}"`);
    return (
      <span
        className="inline-flex items-center px-3 py-1 rounded-md bg-[#F2F4F4] text-[#7C8085] font-medium"
        role="status"
      >
        {String(status)}
      </span>
    );
  }
  
  const translationKey = status === 'in-progress' ? 'inProgress' : status;
  const label = t(`orders.${translationKey}`);
  
  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-md whitespace-nowrap ${config.className}`}
      style={config.style}
      role="status"
      aria-label={`${t('orders.status')}: ${label}`}
    >
      {label}
    </span>
  );
}
