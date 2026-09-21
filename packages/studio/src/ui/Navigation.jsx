"use client";

import { createContext, useContext } from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "./cn";
import { CONTROL_HEIGHT, FOCUS_RING } from "./tokens";

/**
 * Tabs and SegmentedControl.
 *
 * Both are Radix Tabs, so arrow-key traversal, roving focus and the
 * `aria-selected` contract come for free. The difference is purely visual:
 * Tabs is an underline rail for page-level navigation, SegmentedControl is
 * a contained pill group for in-panel mode switching.
 *
 * Horizontal overflow is handled with .scrollbar-rail (PART 23 exception:
 * a rail is scrollable by drag and arrow key, so the affordance is not lost).
 */

/**
 * A trigger has to match the rail it sits in, and passing `variant` to only
 * one of the two is a silent style bug. The list publishes variant and size
 * so triggers inherit them and only real overrides are explicit.
 */
const TabsScope = createContext(null);

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, variant = "underline", size = "md", children, ...props }) {
  return (
    <TabsScope.Provider value={{ variant, size }}>
      <TabsPrimitive.List
        className={cn(
          variant === "segmented"
            ? "inline-flex w-full items-stretch gap-1 rounded-lg border border-line bg-well p-1"
            : "flex w-full items-center gap-1 border-b border-line",
          "scrollbar-rail overflow-x-auto",
          className,
        )}
        {...props}
      >
        {children}
      </TabsPrimitive.List>
    </TabsScope.Provider>
  );
}

const SEGMENTED_HEIGHT = {
  xs: CONTROL_HEIGHT.xs,
  sm: CONTROL_HEIGHT.sm,
  md: CONTROL_HEIGHT.md,
};

export function TabsTrigger({ className, children, variant, size, ...props }) {
  const scope = useContext(TabsScope);
  const resolvedVariant = variant || scope?.variant || "underline";
  const resolvedSize = size || scope?.size || "md";

  if (resolvedVariant === "segmented") {
    return (
      <TabsPrimitive.Trigger
        className={cn(
          "inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3",
          "text-body font-medium text-ink-muted",
          "transition-[background-color,color,box-shadow] duration-fast ease-standard",
          "hover:bg-wash hover:text-ink",
          "data-[state=active]:bg-raised data-[state=active]:text-ink data-[state=active]:shadow-elevation-1",
          "disabled:pointer-events-none disabled:opacity-40",
          FOCUS_RING,
          SEGMENTED_HEIGHT[resolvedSize] || SEGMENTED_HEIGHT.md,
          className,
        )}
        {...props}
      >
        {children}
      </TabsPrimitive.Trigger>
    );
  }
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-3",
        resolvedSize === "sm" ? "h-control-sm" : "h-control-md",
        "text-body font-medium text-ink-muted",
        "transition-[color] duration-fast ease-standard",
        "hover:text-ink",
        "data-[state=active]:text-ink",
        "disabled:pointer-events-none disabled:opacity-40",
        FOCUS_RING,
        // The active indicator is a token line, not a glow.
        "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent",
        "data-[state=active]:after:bg-brand",
        className,
      )}
      {...props}
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({ className, ...props }) {
  return (
    <TabsPrimitive.Content
      className={cn("", FOCUS_RING, className)}
      {...props}
    />
  );
}

/**
 * Standalone segmented control for uncontrolled or externally-controlled
 * mode switching that is not backed by tab panels.
 */
export function SegmentedControl({
  options,
  value,
  onValueChange,
  size = "md",
  className,
  ariaLabel,
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "scrollbar-rail inline-flex w-full items-stretch gap-1 overflow-x-auto rounded-lg border border-line bg-well p-1",
        className,
      )}
    >
      {options.map((opt) => {
        const item = typeof opt === "string" ? { value: opt, label: opt } : opt;
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={item.disabled}
            onClick={() => onValueChange?.(item.value)}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3",
              "text-body font-medium",
              "transition-[background-color,color,box-shadow] duration-fast ease-standard",
              FOCUS_RING,
              active
                ? "bg-raised text-ink shadow-elevation-1"
                : "text-ink-muted hover:bg-wash hover:text-ink",
              "disabled:pointer-events-none disabled:opacity-40",
              SEGMENTED_HEIGHT[size] || SEGMENTED_HEIGHT.md,
            )}
          >
            {item.icon ? item.icon : null}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
