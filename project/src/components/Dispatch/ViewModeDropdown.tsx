import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, CalendarDays, CalendarRange } from 'lucide-react';

export type ViewAction = 'today' | 'day' | 'week';

interface ViewModeDropdownProps {
  onSelectAction: (action: ViewAction) => void;
  currentView: 'calendar' | 'day' | 'week';
}

export function ViewModeDropdown({ onSelectAction, currentView }: ViewModeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelect = (action: ViewAction) => {
    onSelectAction(action);
    setIsOpen(false);
  };

  const getButtonLabel = () => {
    switch (currentView) {
      case 'day':
        return 'Day View';
      case 'week':
        return 'Week View';
      default:
        return 'Today';
    }
  };

  const getButtonIcon = () => {
    switch (currentView) {
      case 'day':
        return <CalendarDays className="w-4 h-4 mr-2" />;
      case 'week':
        return <CalendarRange className="w-4 h-4 mr-2" />;
      default:
        return <Calendar className="w-4 h-4 mr-2" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="btn btn-outline flex items-center space-x-1"
      >
        {getButtonIcon()}
        <span>{getButtonLabel()}</span>
        <ChevronDown className={`w-4 h-4 ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
          <button
            onClick={() => handleSelect('today')}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
          >
            <Calendar className="w-4 h-4 mr-3 text-gray-500" />
            Today
          </button>
          <button
            onClick={() => handleSelect('day')}
            className={`w-full px-4 py-2 text-left text-sm flex items-center ${
              currentView === 'day'
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <CalendarDays className="w-4 h-4 mr-3 text-gray-500" />
            Day View
          </button>
          <button
            onClick={() => handleSelect('week')}
            className={`w-full px-4 py-2 text-left text-sm flex items-center ${
              currentView === 'week'
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <CalendarRange className="w-4 h-4 mr-3 text-gray-500" />
            Week View
          </button>
        </div>
      )}
    </div>
  );
}
