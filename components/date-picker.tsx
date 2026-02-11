// Single date picker component - matches DateRangePicker styling
import { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DatePickerProps {
  date: Date | null;
  onChange: (date: Date | null) => void;
}

export function DatePicker({ date, onChange }: DatePickerProps) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    return date ? new Date(date.getFullYear(), date.getMonth(), 1) : new Date();
  });
  
  // Update currentMonth when date changes externally
  useEffect(() => {
    if (date) {
      setCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  }, [date]);
  
  const month = useMemo(() => {
    return new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  }, [currentMonth]);
  
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const days: (Date | null)[] = [];
    
    // Add empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add all days in month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }
    
    return days;
  };
  
  const handleDateClick = (clickedDate: Date) => {
    onChange(clickedDate);
  };
  
  const isSelected = (dateToCheck: Date) => {
    if (!date) return false;
    return dateToCheck.getTime() === date.getTime();
  };
  
  const isToday = (dateToCheck: Date) => {
    const today = new Date();
    return dateToCheck.getDate() === today.getDate() &&
           dateToCheck.getMonth() === today.getMonth() &&
           dateToCheck.getFullYear() === today.getFullYear();
  };
  
  const isPastDate = (dateToCheck: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dateToCheck < today;
  };
  
  const formatMonthYear = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };
  
  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };
  
  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };
  
  const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  
  return (
    <div className="bg-white border border-[#E4E7E7] rounded-lg p-4">
      {/* Navigation */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={goToPreviousMonth}
          className="p-2 hover:bg-[#F7F8F8] rounded-lg transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft size={20} className="text-[#555A60]" />
        </button>
        
        <h3 className="text-[#1E2025] min-w-[140px] text-center text-base font-medium">
          {formatMonthYear(month)}
        </h3>
        
        <button
          onClick={goToNextMonth}
          className="p-2 hover:bg-[#F7F8F8] rounded-lg transition-colors"
          aria-label="Next month"
        >
          <ChevronRight size={20} className="text-[#555A60]" />
        </button>
      </div>
      
      {/* Week day headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDays.map((day) => (
          <div
            key={day}
            className="text-center text-[#7C8085] text-sm font-medium py-2"
          >
            {day}
          </div>
        ))}
      </div>
      
      {/* Calendar days */}
      <div className="grid grid-cols-7 gap-1">
        {getDaysInMonth(month).map((dayDate, index) => {
          if (!dayDate) {
            return <div key={`empty-${index}`} className="aspect-square" />;
          }
          
          const selected = isSelected(dayDate);
          const today = isToday(dayDate);
          const past = isPastDate(dayDate);
          
          return (
            <button
              key={index}
              onClick={() => handleDateClick(dayDate)}
              className={`
                aspect-square flex items-center justify-center rounded-lg transition-colors relative text-sm font-medium
                ${selected
                  ? 'bg-[#1F744F] text-white hover:bg-[#165B3C]' 
                  : past
                    ? 'text-[#C0C4C8] hover:bg-[#F7F8F8]'
                    : 'text-[#1E2025] hover:bg-[#F7F8F8]'
                }
                ${today && !selected ? 'ring-2 ring-[#1F744F] ring-inset' : ''}
              `}
            >
              {dayDate.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
