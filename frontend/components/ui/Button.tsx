import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'glass';
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
    const baseStyles = 'inline-flex items-center justify-center font-medium transition-all duration-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring active:scale-95 hover:scale-[1.02]';

    const variantStyles = {
      primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm hover:shadow-md',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:shadow-sm',
      outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground hover:border-accent-foreground/20',
      ghost: 'hover:bg-accent hover:text-accent-foreground',
      danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm hover:shadow-md',
      glass: 'bg-secondary/50 text-secondary-foreground hover:bg-secondary/80 backdrop-blur-sm',
    };

    const sizeStyles = {
      sm: 'text-sm px-3 py-2 gap-1.5',     // 16px text
      md: 'text-base px-4 py-2.5 gap-2',   // 16px text
      lg: 'text-lg px-5 py-3 gap-2.5',     // 18px text
    };

    const widthStyles = fullWidth ? 'w-full' : '';

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${widthStyles} ${className}`}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
