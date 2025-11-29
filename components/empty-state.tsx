// Empty state component for consistent empty UI
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      {Icon && (
        <Icon 
          size={48} 
          className="text-[#B5BDB9] mb-4" 
          aria-hidden="true" 
        />
      )}
      <h3 className="text-[#1E2025] mb-2">{title}</h3>
      {description && (
        <p className="text-[#7C8085] mb-4 max-w-md">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 bg-[#1F744F] text-white rounded-lg hover:bg-[#165B3C] transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
