'use client';

import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  subtitle?: string;
  disabled?: boolean;
}

interface CustomSelectProps {
  options: SelectOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function CustomSelect({
  options,
  value,
  onChange,
  placeholder = 'Select an option...',
  className = '',
  disabled = false,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  // Find selected option
  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all text-left ${
          disabled
            ? 'bg-muted/30 border-border cursor-not-allowed opacity-50'
            : isOpen
            ? 'border-primary bg-background ring-2 ring-primary/20'
            : 'border-border bg-background hover:border-muted-foreground/50'
        }`}
      >
        <div className="flex-1 min-w-0">
          {selectedOption ? (
            <div>
              <div className="text-sm font-medium text-foreground truncate">
                {selectedOption.label}
              </div>
              {selectedOption.subtitle && (
                <div className="text-xs text-muted-foreground truncate">
                  {selectedOption.subtitle}
                </div>
              )}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">{placeholder}</span>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground flex-shrink-0 ml-2 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-background border border-border rounded-lg shadow-lg max-h-[300px] overflow-y-auto">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground text-center">
              No options available
            </div>
          ) : (
            <>
              {/* Empty option for deselect */}
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-muted transition-colors first:rounded-t-lg"
              >
                <span className="text-muted-foreground">{placeholder}</span>
                {value === null && (
                  <Check className="w-4 h-4 text-primary flex-shrink-0" />
                )}
              </button>

              {/* Options */}
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    if (!option.disabled) {
                      onChange(option.value);
                      setIsOpen(false);
                    }
                  }}
                  disabled={option.disabled}
                  className={`w-full flex items-start justify-between px-3 py-2 text-left transition-colors last:rounded-b-lg ${
                    option.disabled
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-muted cursor-pointer'
                  } ${value === option.value ? 'bg-muted/50' : ''}`}
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="text-sm font-medium text-foreground truncate">
                      {option.label}
                    </div>
                    {option.subtitle && (
                      <div className="text-xs text-muted-foreground truncate mt-0.5">
                        {option.subtitle}
                      </div>
                    )}
                  </div>
                  {value === option.value && (
                    <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
