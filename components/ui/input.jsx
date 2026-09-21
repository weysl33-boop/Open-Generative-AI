import * as React from "react";
import { cn } from "@/lib/utils";
import { FIELD_BASE, controlClasses } from "studio/ui/tokens";

/**
 * KOYO Studio Input. `invalid` is the same vocabulary the studio primitive
 * uses, and it maps to `aria-invalid` so the red edge is never the only
 * signal.
 */
const FIELD_PAD = { xs: "px-2", sm: "px-2.5", md: "px-3", lg: "px-3.5" };

const Input = React.forwardRef(
  ({ className, type = "text", size = "md", disabled = false, invalid = false, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      className={cn(
        FIELD_BASE,
        controlClasses(size, { pad: FIELD_PAD[size] || FIELD_PAD.md }),
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
export default Input;
