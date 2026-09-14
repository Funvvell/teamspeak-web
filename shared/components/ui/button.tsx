'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@shared/lib/utils';
import { Loader2 } from 'lucide-react';

const buttonVariants = cva(
    [
        'inline-flex items-center justify-center gap-2',
        'border border-brutal rounded-brutal',
        'font-semibold tracking-tight',
        'transition-all duration-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brutal-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brutal-bg,#fff)]',
        'disabled:opacity-40 disabled:pointer-events-none',
        'cursor-pointer',
        'text-[13px]',
    ],
    {
        variants: {
            variant: {
                default: [
                    'bg-brutal-bg text-brutal-fg border-brutal',
                    'hover:bg-brutal-muted',
                ],
                primary: [
                    'bg-brutal-primary text-white border-transparent shadow-sm',
                    'hover:bg-[#0055b3] hover:text-white hover:shadow-md hover:-translate-y-px',
                ],
                secondary: [
                    'bg-[#34c759] text-white border-transparent',
                    'hover:bg-[#2db84e]',
                ],
                accent: [
                    'bg-[#ff9500] text-white border-transparent',
                    'hover:bg-[#e68600]',
                ],
                danger: [
                    'bg-[#ff3b30] text-white border-transparent',
                    'hover:bg-[#e0342a]',
                ],
                success: [
                    'bg-[#34c759] text-white border-transparent',
                    'hover:bg-[#2db84e]',
                ],
                outline: [
                    'bg-transparent text-brutal-fg border-brutal',
                    'hover:bg-brutal-muted',
                ],
                ghost: [
                    'bg-transparent text-brutal-primary border-transparent',
                    'hover:bg-[rgba(0,113,227,0.08)]',
                ],
                link: [
                    'bg-transparent text-brutal-primary border-transparent',
                    'underline-offset-4 hover:underline',
                ],
            },
            size: {
                sm: 'h-8 px-3 py-1 text-[12px]',
                default: 'h-10 px-4 py-1.5 text-[13px]',
                lg: 'h-12 px-6 py-2.5 text-[15px]',
                xl: 'h-16 px-10 py-4 text-[16px]',
                icon: 'h-10 w-10 p-0',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    }
);

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof buttonVariants> {
    asChild?: boolean;
    loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            className,
            variant,
            size,
            asChild = false,
            loading = false,
            disabled,
            children,
            ...props
        },
        ref
    ) => {
        const Comp = asChild ? Slot : 'button';
        const isDisabled = disabled || loading;

        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                disabled={isDisabled}
                {...props}
            >
                {loading ? (
                    <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {children}
                    </>
                ) : (
                    children
                )}
            </Comp>
        );
    }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
