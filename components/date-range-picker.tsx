// Date range picker component - booking-style calendar experience
import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DateRangePickerProps {
  startDate: Date | null;
  endDate: Date | null;
  onRangeChange: (start: Date | null, end: Date | null) => void;
  singleMonth?: boolean;
}

export function DateRangePicker({ startDate, endDate, onRangeChange, singleMonth = false }: DateRangePickerProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectingStart, setSelectingStart] = useState(true);
  
  const months = useMemo(() => {
    const first = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    if (singleMonth) {
      return [first];
    }
    const second = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    return [first, second];
  }, [currentMonth, singleMonth]);
  
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
  
  const handleDateClick = (date: Date) => {
    if (selectingStart || !startDate) {
      // Start new selection
      onRangeChange(date, null);
      setSelectingStart(false);
    } else {
      // Complete the range
      if (date < startDate) {
        // If clicked date is before start, swap them
        onRangeChange(date, startDate);
      } else {
        onRangeChange(startDate, date);
      }
      setSelectingStart(true);
    }
  };
  
  const isInRange = (date: Date) => {
    if (!startDate || !endDate) return false;
    const time = date.getTime();
    return time >= startDate.getTime() && time <= endDate.getTime();
  };
  
  const isStartDate = (date: Date) => {
    return startDate && date.getTime() === startDate.getTime();
  };
  
  const isEndDate = (date: Date) => {
    return endDate && date.getTime() === endDate.getTime();
  };
  
  const isToday = (date: Date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };
  
  const isPastDate = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
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
        
        <div className={singleMonth ? "flex" : "flex gap-12"}>
          <h3 className="text-[#1E2025] min-w-[140px] text-center text-base font-medium">
            {formatMonthYear(months[0])}
          </h3>
          {!singleMonth && (
            <h3 className="text-[#1E2025] min-w-[140px] text-center text-base font-medium">
              {formatMonthYear(months[1])}
            </h3>
          )}
        </div>
        
        <button
          onClick={goToNextMonth}
          className="p-2 hover:bg-[#F7F8F8] rounded-lg transition-colors"
          aria-label="Next month"
        >
          <ChevronRight size={20} className="text-[#555A60]" />
        </button>
      </div>
      
      {/* Month View */}
      <div className={singleMonth ? "" : "grid grid-cols-2 gap-8"}>
        {months.map((month, monthIndex) => (
          <div key={monthIndex}>
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
              {getDaysInMonth(month).map((date, index) => {
                if (!date) {
                  return <div key={`empty-${index}`} className="aspect-square" />;
                }
                
                const inRange = isInRange(date);
                const isStart = isStartDate(date);
                const isEnd = isEndDate(date);
                const today = isToday(date);
                const past = isPastDate(date);
                
                return (
                  <button
                    key={index}
                    onClick={() => handleDateClick(date)}
                    className={`
                      aspect-square flex items-center justify-center rounded-lg transition-colors relative text-sm font-medium
                      ${isStart || isEnd 
                        ? 'bg-[#1F744F] text-white hover:bg-[#165B3C]' 
                        : inRange
                          ? 'bg-[#E8F5E9] text-[#1F744F] hover:bg-[#D4EDD6]'
                          : past
                            ? 'text-[#C0C4C8] hover:bg-[#F7F8F8]'
                            : 'text-[#1E2025] hover:bg-[#F7F8F8]'
                      }
                      ${today && !isStart && !isEnd ? 'ring-2 ring-[#1F744F] ring-inset' : ''}
                    `}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      
      {/* Helper text */}
      <div className="mt-4 text-center text-[#7C8085]">
        {selectingStart || !startDate 
          ? 'Select start date' 
          : 'Select end date'}
      </div>
    </div>
  );
}

