import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  fullWidth?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      fullWidth = false,
      className = '',
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium transition-colors rounded-full disabled:opacity-50 disabled:cursor-not-allowed';

    const variantStyles = {
      primary: 'bg-slate-50 text-slate-900 hover:bg-slate-200',
      secondary: 'bg-slate-900/80 border border-slate-700 text-slate-100 hover:bg-slate-800',
      outline: 'border border-slate-700 bg-transparent text-slate-100 hover:bg-slate-900/50',
      ghost: 'bg-transparent text-slate-300 hover:text-slate-50 hover:bg-slate-900/50',
      danger: 'bg-red-600 text-white hover:bg-red-700',
    };

    const sizeStyles = {
      sm: 'text-xs px-3 py-1.5',
      md: 'text-sm px-4 py-2',
      lg: 'text-base px-6 py-3',
    };

    const widthStyles = fullWidth ? 'w-full' : '';

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${widthStyles} ${className}`}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
