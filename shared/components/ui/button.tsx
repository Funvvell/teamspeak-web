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
        'font-bold tracking-wider uppercase',
        'transition-colors duration-100',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brutal-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brutal-bg,#fbf7ee)]',
        'disabled:opacity-50 disabled:pointer-events-none',
        'cursor-pointer',
        'text-[12px] font-mono',
    ],
    {
        variants: {
            variant: {
                default: [
                    'bg-brutal-bg text-brutal-fg border-brutal-fg',
                    'hover:bg-brutal-muted',
                ],
                primary: [
                    'bg-brutal-primary text-white border-[#a82f12]',
                    'hover:bg-[#a82f12]',
                ],
                secondary: [
                    'bg-brutal-secondary text-white border-[#245436]',
                    'hover:bg-[#245436]',
                ],
                accent: [
                    'bg-brutal-accent text-[#1a1714] border-[#a67a1f]',
                    'hover:bg-[#a67a1f]',
                ],
                danger: [
                    'bg-brutal-destructive text-white border-[#7a2424]',
                    'hover:bg-[#7a2424]',
                ],
                success: [
                    'bg-brutal-success text-white border-[#245436]',
                    'hover:bg-[#245436]',
                ],
                outline: [
                    'bg-transparent text-brutal-fg border-brutal-fg',
                    'hover:bg-brutal-fg hover:text-brutal-bg',
                ],
                ghost: [
                    'bg-transparent text-brutal-fg border-transparent',
                    'hover:bg-brutal-muted',
                ],
                link: [
                    'bg-transparent text-brutal-primary border-transparent',
                    'underline-offset-4 hover:underline',
                ],
            },
            size: {
                sm: 'h-8 px-2.5 py-1 text-[11px]',
                default: 'h-9 px-3.5 py-1.5 text-[12px]',
                lg: 'h-12 px-6 py-2.5 text-[13px]',
                xl: 'h-16 px-10 py-4 text-[14px]',
                icon: 'h-9 w-9 p-0',
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
