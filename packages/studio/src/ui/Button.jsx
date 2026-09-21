"use client";

import { forwardRef } from "react";
import { Slot } from "radix-ui";
import { cn } from "./cn";
import { Spinner } from "./Feedback";
import {
  BUTTON_VARIANTS,
  BUTTON_WEIGHT,
  CONTROL_BASE,
  CONTROL_HEIGHT,
  controlClasses,
} from "./tokens";

/**
 * The only button in the product. `variant="primary"` is reserved for the
 * main action of a view — Generate, Create, Run, Submit.
 *
 * `asChild` hands the recipe to the caller's element (a Link, a Radix trigger)
 * instead of nesting one interactive node inside another. `icon*` sizes are the
 * square hit-area names from the control contract, so an icon glyph can never
 * be rendered inside an under-sized target (PART 10).
 */
const ICON_SIZES = { icon: "md", "icon-sm": "sm", "icon-md": "md", "icon-lg": "lg" };

function resolveSize(size) {
  if (ICON_SIZES[size]) return { size: ICON_SIZES[size], icon: true };
  return { size: CONTROL_HEIGHT[size] ? size : "md", icon: false };
}

export const Button = forwardRef(function Button(
  {
    as: As = "button",
    asChild = false,
    variant = "secondary",
    size = "md",
    loading = false,
    disabled = false,
    fullWidth = false,
    className,
    children,
    type = "button",
    ...props
  },
  ref,
) {
  const isDisabled = disabled || loading;
  const variantKey = BUTTON_VARIANTS[variant] ? variant : "secondary";
  const { size: controlSize, icon } = resolveSize(size);
  const Component = asChild ? Slot.Root : As;
  return (
    <Component
      ref={ref}
      type={Component === "button" ? type : undefined}
      disabled={Component === "button" ? isDisabled : undefined}
      aria-busy={loading || undefined}
      className={cn(
        CONTROL_BASE,
        controlClasses(controlSize, { icon }),
        BUTTON_WEIGHT[variantKey],
        BUTTON_VARIANTS[variantKey],
        "[&_svg]:pointer-events-none [&_svg]:shrink-0",
        fullWidth && "w-full",
        loading && "cursor-progress",
        className,
      )}
      {...props}
    >
      {/* Slot takes a single child, so the spinner can never join it. */}
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <Spinner size="sm" /> : null}
          {children}
        </>
      )}
    </Component>
  );
});

/**
 * Icon-only button. The glyph may be 16px but the hit area always follows the
 * control height contract, so it is never smaller than 28px.
 */
export const IconButton = forwardRef(function IconButton(
  { icon, size = "md", label, className, ...props },
  ref,
) {
  if (!label && process.env.NODE_ENV !== "production") {
    // Fail loudly in development: an unlabeled icon button is a WCAG failure.
    // eslint-disable-next-line no-console
    console.warn("[IconButton] `label` is required for accessibility.");
  }
  const Icon = icon;
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={cn(
        CONTROL_BASE,
        controlClasses(size, { icon: true }),
        BUTTON_VARIANTS.tertiary,
        className,
      )}
      {...props}
    >
      <Icon className="size-4" strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
});

export { CONTROL_HEIGHT };
export default Button;
