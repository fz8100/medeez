import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'text-foreground',
        success: 'border-transparent bg-success-600 text-white hover:bg-success-700',
        warning: 'border-transparent bg-warning-600 text-white hover:bg-warning-700',
        error: 'border-transparent bg-error-600 text-white hover:bg-error-700',
        medical: 'border-transparent bg-medical-600 text-white hover:bg-medical-700',
        // Status-specific variants for medical use
        active: 'border-transparent bg-success-100 text-success-800',
        inactive: 'border-transparent bg-gray-100 text-gray-800',
        pending: 'border-transparent bg-warning-100 text-warning-800',
        cancelled: 'border-transparent bg-error-100 text-error-800',
        completed: 'border-transparent bg-success-100 text-success-800',
        scheduled: 'border-transparent bg-blue-100 text-blue-800',
        confirmed: 'border-transparent bg-green-100 text-green-800',
        'no-show': 'border-transparent bg-red-100 text-red-800',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };