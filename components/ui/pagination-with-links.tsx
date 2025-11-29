import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "./utils";

interface PaginationWithLinksProps {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange?: (page: number) => void;
  className?: string;
}

export function PaginationWithLinks({
  page,
  pageSize,
  totalCount,
  onPageChange,
  className,
}: PaginationWithLinksProps) {
  const totalPages = Math.ceil(totalCount / pageSize);
  
  if (totalPages <= 1) {
    return null;
  }

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages && onPageChange) {
      onPageChange(newPage);
    }
  };

  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    
    if (totalPages <= 7) {
      // Show all pages if 7 or fewer
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);
      
      if (page > 3) {
        pages.push('ellipsis');
      }
      
      // Show pages around current
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      
      for (let i = start; i <= end; i++) {
        if (i !== 1 && i !== totalPages) {
          pages.push(i);
        }
      }
      
      if (page < totalPages - 2) {
        pages.push('ellipsis');
      }
      
      // Always show last page
      pages.push(totalPages);
    }
    
    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <nav
      role="navigation"
      aria-label="pagination"
      className={cn("flex items-center justify-center gap-1", className)}
    >
      {/* Previous Button */}
      <button
        onClick={() => handlePageChange(page - 1)}
        disabled={page <= 1}
        className={cn(
          "flex items-center gap-1 px-3 py-2 text-sm text-[#555A60] rounded-md transition-colors",
          "hover:bg-[#F7F8F8] hover:text-[#1E2025]",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent",
          page <= 1 && "opacity-50 cursor-not-allowed"
        )}
        aria-label="Go to previous page"
      >
        <ChevronLeft size={16} />
        <span>Previous</span>
      </button>

      {/* Page Numbers */}
      <div className="flex items-center gap-1">
        {pageNumbers.map((pageNum, index) => {
          if (pageNum === 'ellipsis') {
            return (
              <span
                key={`ellipsis-${index}`}
                className="flex items-center justify-center w-9 h-9 text-[#555A60]"
                aria-hidden="true"
              >
                ...
              </span>
            );
          }

          const isActive = page === pageNum;

          return (
            <button
              key={pageNum}
              onClick={() => handlePageChange(pageNum)}
              className={cn(
                "flex items-center justify-center min-w-[36px] h-9 px-3 text-sm rounded-md transition-colors",
                isActive
                  ? "bg-[#E4E7E7] text-[#1E2025] font-medium"
                  : "text-[#555A60] hover:bg-[#F7F8F8] hover:text-[#1E2025]"
              )}
              aria-label={`Go to page ${pageNum}`}
              aria-current={isActive ? "page" : undefined}
            >
              {pageNum}
            </button>
          );
        })}
      </div>

      {/* Next Button */}
      <button
        onClick={() => handlePageChange(page + 1)}
        disabled={page >= totalPages}
        className={cn(
          "flex items-center gap-1 px-3 py-2 text-sm text-[#555A60] rounded-md transition-colors",
          "hover:bg-[#F7F8F8] hover:text-[#1E2025]",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent",
          page >= totalPages && "opacity-50 cursor-not-allowed"
        )}
        aria-label="Go to next page"
      >
        <span>Next</span>
        <ChevronRight size={16} />
      </button>
    </nav>
  );
}

