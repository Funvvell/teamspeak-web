'use client';

import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@shared/lib/utils';

const Switch = React.forwardRef<
    React.ElementRef<typeof SwitchPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
    <SwitchPrimitive.Root
        className={cn(
            'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center',
            'border border-brutal',
            'transition-colors duration-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brutal-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbf7ee]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'data-[state=checked]:bg-[#2f6b45] data-[state=unchecked]:bg-[#e8dfd0]',
            className
        )}
        {...props}
        ref={ref}
    >
        <SwitchPrimitive.Thumb
            className={cn(
                'pointer-events-none block h-4 w-4',
                'bg-[#1a1714] border border-[#1a1714]',
                'transition-transform duration-100',
                'data-[state=checked]:translate-x-6 data-[state=unchecked]:translate-x-0.5'
            )}
        />
    </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;

export { Switch };
