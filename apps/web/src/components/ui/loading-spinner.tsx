import * as React from 'react';
import { cn } from '@/lib/utils';

export interface LoadingSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'default' | 'medical';
}

const sizeClasses = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-2',
  xl: 'h-12 w-12 border-4',
};

const LoadingSpinner = React.forwardRef<HTMLDivElement, LoadingSpinnerProps>(
  ({ className, size = 'md', variant = 'default', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'inline-block animate-spin rounded-full border-current border-t-transparent',
          sizeClasses[size],
          variant === 'medical' && 'text-medical-600',
          className
        )}
        {...props}
        role="status"
        aria-label="Loading"
      >
        <span className="sr-only">Loading...</span>
      </div>
    );
  }
);
LoadingSpinner.displayName = 'LoadingSpinner';

export { LoadingSpinner };