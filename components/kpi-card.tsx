// KPI card component for dashboard metrics
import { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  onClick?: () => void;
}

export function KPICard({ title, value, icon: Icon, trend, onClick }: KPICardProps) {
  const isClickable = !!onClick;
  
  const content = (
    <>
      <div className="flex items-start justify-between mb-2 min-h-[1.5rem]">
        <p className="text-[#555A60] leading-tight flex-1 min-w-0">{title}</p>
        {Icon && (
          <div className="text-[#1F744F] flex-shrink-0 ml-2" aria-hidden="true">
            <Icon size={20} />
          </div>
        )}
      </div>
      <p className="text-[#1E2025] mb-2 whitespace-nowrap min-h-[1.5rem] leading-tight">{value}</p>
      {trend && (
        <p className={`${trend.isPositive ? 'text-[#319B53]' : 'text-[#E5484D]'}`}>
          {trend.value}
        </p>
      )}
    </>
  );
  
  const baseClasses = "bg-white rounded-xl border border-[#E4E7E7] p-6 text-left min-w-0 h-full w-full";
  
  if (isClickable) {
    return (
      <button
        onClick={onClick}
        className={`${baseClasses} hover:shadow-sm transition-shadow cursor-pointer`}
        type="button"
      >
        {content}
      </button>
    );
  }
  
  return (
    <div className={baseClasses}>
      {content}
    </div>
  );
}
