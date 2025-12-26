import { InputHTMLAttributes, forwardRef, ReactNode } from 'react';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: ReactNode;
  prefix?: string;
  suffix?: string;
  size?: 'sm' | 'md';
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, helperText, leftIcon, prefix, suffix, size = 'md', ...props }, ref) => {
    const hasPrefix = prefix || leftIcon;
    const hasSuffix = suffix;

    // Size-based classes
    const sizeClasses = size === 'sm'
      ? 'h-6 py-0.5 text-xs'
      : 'h-10 py-2 text-sm';

    const labelClasses = size === 'sm'
      ? 'text-[10px] mb-0.5'
      : 'text-sm mb-1.5';

    const paddingClasses = size === 'sm'
      ? (hasPrefix ? 'pl-5' : 'pl-1.5') + ' ' + (hasSuffix ? 'pr-5' : 'pr-1.5')
      : (hasPrefix ? 'pl-8' : 'pl-3') + ' ' + (hasSuffix ? 'pr-8' : 'pr-3');

    const iconPositionClasses = size === 'sm' ? 'left-1.5' : 'left-3';
    const suffixPositionClasses = size === 'sm' ? 'right-1.5' : 'right-3';
    const textSizeClass = size === 'sm' ? 'text-[10px]' : 'text-sm';

    return (
      <div className="w-full">
        {label && (
          <label className={`block font-medium text-foreground ${labelClasses}`}>
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className={`absolute ${iconPositionClasses} top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none`}>
              {leftIcon}
            </div>
          )}
          {prefix && (
            <div className={`absolute ${iconPositionClasses} top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none ${size === 'sm' ? 'text-xs' : 'text-sm'} font-medium`}>
              {prefix}
            </div>
          )}
          <input
            className={`flex w-full rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 transition-colors ${sizeClasses} ${paddingClasses} ${error ? 'border-red-500 focus:ring-red-500' : ''} ${className}`}
            ref={ref}
            {...props}
          />
          {suffix && (
            <div className={`absolute ${suffixPositionClasses} top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none ${textSizeClass} font-medium`}>
              {suffix}
            </div>
          )}
        </div>
        {helperText && !error && (
          <p className="mt-1.5 text-xs text-muted-foreground">{helperText}</p>
        )}
        {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
