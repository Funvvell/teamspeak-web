import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@shared/lib/utils';

const inputVariants = cva(
    [
        'flex w-full',
        'border border-brutal rounded-brutal',
        'bg-brutal-bg text-brutal-fg',
        'font-mono tracking-wide',
        'placeholder:text-[#8a7f70] placeholder:font-normal',
        'transition-colors duration-100',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brutal-ring focus-visible:ring-offset-0',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-brutal-muted',
    ],
    {
        variants: {
            variant: {
                default: '',
                error: 'border-[#9b2f2f] focus-visible:ring-[#9b2f2f]',
                success: 'border-[#2f6b45] focus-visible:ring-[#2f6b45]',
            },
            size: {
                sm: 'h-8 px-2 py-1 text-[11px]',
                default: 'h-10 px-3 py-2 text-[13px]',
                lg: 'h-12 px-4 py-2 text-[14px]',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    }
);

export interface InputProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
        VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, variant, size, type, ...props }, ref) => {
        return (
            <input
                type={type}
                className={cn(inputVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        );
    }
);
Input.displayName = 'Input';

export { Input, inputVariants };
