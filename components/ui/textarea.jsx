import * as React from "react";
import { cn } from "@/lib/utils";
import { FIELD_BASE } from "studio/ui/tokens";

/**
 * KOYO Studio Textarea — delegates its whole visual contract to FIELD_BASE.
 * A textarea has no fixed control height, so it takes the md padding and
 * type recipe explicitly rather than through controlClasses().
 */
const Textarea = React.forwardRef(
  ({ className, disabled = false, invalid = false, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={cn(
          FIELD_BASE,
          "rounded-md px-3 py-2 text-body resize-y",
          className
        )}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
