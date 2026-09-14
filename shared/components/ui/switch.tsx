'use client';

import * as React from 'react';
import { cn } from '@shared/lib/utils';

/** Square archival switch — no Radix, avoids preflight-less layout bugs. */
export interface SwitchProps
    extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
    ({ className, checked = false, onCheckedChange, disabled, ...props }, ref) => (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            ref={ref}
            className={cn('switch', checked && 'on', className)}
            onClick={() => onCheckedChange?.(!checked)}
            {...props}
        >
            <i />
        </button>
    )
);
Switch.displayName = 'Switch';

export { Switch };
