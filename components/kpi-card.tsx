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
      <div className="flex items-start justify-between mb-2">
        <p className="text-[#555A60]">{title}</p>
        {Icon && (
          <div className="text-[#1F744F]" aria-hidden="true">
            <Icon size={20} />
          </div>
        )}
      </div>
      <p className="text-[#1E2025] mb-2">{value}</p>
      {trend && (
        <p className={`${trend.isPositive ? 'text-[#319B53]' : 'text-[#E5484D]'}`}>
          {trend.value}
        </p>
      )}
    </>
  );
  
  if (isClickable) {
    return (
      <button
        onClick={onClick}
        className="bg-white rounded-xl border border-[#E4E7E7] p-6 text-left hover:shadow-sm transition-shadow w-full cursor-pointer"
      >
        {content}
      </button>
    );
  }
  
  return (
    <div className="bg-white rounded-xl border border-[#E4E7E7] p-6">
      {content}
    </div>
  );
}
