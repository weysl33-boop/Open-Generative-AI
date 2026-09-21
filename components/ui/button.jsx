import { forwardRef } from "react";
import { Button as StudioButton } from "studio/ui/button";

/**
 * KOYO Studio Button — the app-side face of the single button primitive.
 *
 * Everything visual and structural comes from studio/ui/button; this file only
 * translates the legacy prop vocabulary so no call site had to change:
 * `ghost` was the historical name for `tertiary`, `destructive` for `danger`.
 *
 * `xs` and the `icon-*` sizes are new here and in the primitive: 12 call sites
 * already asked for them and silently received an unstyled control, because the
 * previous cva map had no such key.
 */
const VARIANT_ALIAS = {
  primary: "primary",
  secondary: "secondary",
  outline: "outline",
  danger: "danger",
  ghost: "tertiary",
  tertiary: "tertiary",
  destructive: "danger",
};

const Button = forwardRef(function Button({ variant, ...props }, ref) {
  return (
    <StudioButton
      ref={ref}
      variant={VARIANT_ALIAS[variant] || "secondary"}
      {...props}
    />
  );
});
Button.displayName = "Button";

export { Button };
export default Button;
