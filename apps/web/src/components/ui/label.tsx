import * as React from 'react';
import { cn } from '@/lib/utils';

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn('flex flex-col gap-1.5 text-sm font-medium text-foreground', className)}
      {...props}
    />
  )
);
Label.displayName = 'Label';
