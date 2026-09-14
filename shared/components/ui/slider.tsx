'use client';

import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';

import { cn } from '@shared/lib/utils';

const Slider = React.forwardRef<
    React.ElementRef<typeof SliderPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
    <SliderPrimitive.Root
        ref={ref}
        className={cn(
            'relative flex w-full touch-none select-none items-center',
            className
        )}
        {...props}
    >
        <SliderPrimitive.Track
            className={cn(
                'relative h-5 w-full grow overflow-hidden rounded-full',
                'border border-[#d2d2d7] bg-[#e5e5ea]',
                'shadow-none'
            )}
        >
            <SliderPrimitive.Range className="absolute h-full bg-[#0066cc] rounded-full" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
            className={cn(
                'block h-5 w-5 rounded-full',
                'border border-[#d2d2d7] bg-white',
                'shadow-[0_1px_4px_rgba(0,0,0,0.16)]',
                'transition-all duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066cc] focus-visible:ring-offset-2',
                'disabled:pointer-events-none disabled:opacity-50',
                'hover:scale-105 active:scale-95',
                'cursor-grab active:cursor-grabbing'
            )}
        />
    </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
