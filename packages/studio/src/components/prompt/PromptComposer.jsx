"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";

import { Check, ChevronDown, Clock, Gem, RectangleHorizontal } from "lucide-react";
import { cn } from "../../ui/cn";
import {
  BUTTON_VARIANTS,
  BUTTON_WEIGHT,
  CONTROL_BASE,
  FOCUS_RING,
  MENU_ITEM,
  MENU_ITEM_PAD,
  PROMPT_CONTROLS_ROW,
  PROMPT_CONTROL_ACTIVE,
  PROMPT_CONTROL_IDLE,
  PROMPT_FOOTER,
  PROMPT_MEDIA_ACTIVE,
  PROMPT_MEDIA_IDLE,
  PROMPT_MEDIA_SQUARE,
  PROMPT_PANEL,
  PROMPT_POPOVER,
  PROMPT_POPOVER_ANCHOR,
  PROMPT_POPOVER_SECTION,
  PROMPT_TEXTAREA,
  controlClasses,
} from "../../ui/tokens";

/**
 * Prompt Composer — the product's first-class component.
 *
 * Every visual value is imported from ui/tokens; nothing is declared here.
 * The exported names and signatures are the stable contract the 11 studios
 * compile against, so they are preserved exactly.
 */

/** Composer pills are denser than toolbar buttons: 38px tall, label type. */
const COMPOSER_SIZE = { size: "md", text: "text-label" };

const DEFAULT_POSITION_CLASS =
  "absolute bottom-4 z-sticky w-full max-w-composer-mobile animate-fade-in lg:max-w-4xl";

export const PROMPT_COMPOSER_POSITION_CLASS = DEFAULT_POSITION_CLASS;

export function promptControlClassName({
  active = false,
  compact = false,
  iconOnly = false,
  className = "",
} = {}) {
  return cn(
    CONTROL_BASE,
    controlClasses(COMPOSER_SIZE.size, {
      icon: iconOnly,
      text: COMPOSER_SIZE.text,
      pad: compact ? "px-2.5" : undefined,
    }),
    active ? PROMPT_CONTROL_ACTIVE : PROMPT_CONTROL_IDLE,
    className,
  );
}

export function promptMediaButtonClassName({ active = false, className = "" } = {}) {
  return cn(
    PROMPT_MEDIA_SQUARE,
    // The media slot is a 38px square by contract; without this a caller that
    // forgot a size class got an icon-shaped target with no hit area at all.
    controlClasses(COMPOSER_SIZE.size, { icon: true }),
    active ? PROMPT_MEDIA_ACTIVE : PROMPT_MEDIA_IDLE,
    className,
  );
}

export const PROMPT_MEDIA_PREVIEW_CLASS = cn(
  PROMPT_MEDIA_SQUARE,
  "border-line bg-well",
);

export const PROMPT_CONTROL_LABEL_CLASS = "truncate text-current";

/* Icon size and stroke are fixed here so no studio can render a 24px
   default lucide glyph inside a 38px control (PART 10). */
const ICON_PROPS = { size: 12, strokeWidth: 1.8, "aria-hidden": true };
const LEAD_ICON_PROPS = { size: 14, strokeWidth: 1.8, "aria-hidden": true };

export function PromptChevronIcon({ className = "" }) {
  return (
    <ChevronDown
      {...ICON_PROPS}
      className={cn("shrink-0 opacity-60 transition-opacity group-hover:opacity-100", className)}
    />
  );
}

export function PromptAspectRatioIcon({ className = "" }) {
  return <RectangleHorizontal {...LEAD_ICON_PROPS} className={cn("shrink-0", className)} />;
}

export function PromptDurationIcon({ className = "" }) {
  return <Clock {...LEAD_ICON_PROPS} className={cn("shrink-0", className)} />;
}

export function PromptQualityIcon({ className = "" }) {
  return <Gem {...LEAD_ICON_PROPS} className={cn("shrink-0", className)} />;
}

export const PromptPopover = forwardRef(function PromptPopover(
  {
    children,
    className = "",
    positionClassName = PROMPT_POPOVER_ANCHOR,
    fitViewport = false,
    ...props
  },
  ref,
) {
  const popoverRef = useRef(null);
  useImperativeHandle(ref, () => popoverRef.current);
  useLayoutEffect(() => {
    if (!fitViewport) return;
    const position = () => {
      const popover = popoverRef.current;
      if (!popover) return;
      popover.style.translate = "";
      popover.style.height = "";
      let left = 16;
      let right = window.innerWidth - 16;
      let top = 16;
      for (let parent = popover.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        const clipsX = /auto|scroll|hidden|clip/.test(style.overflowX);
        const clipsY = /auto|scroll|hidden|clip/.test(style.overflowY);
        if (!clipsX && !clipsY) continue;
        const bounds = parent.getBoundingClientRect();
        if (clipsX) {
          left = Math.max(left, bounds.left + 16);
          right = Math.min(right, bounds.right - 16);
        }
        if (clipsY) top = Math.max(top, bounds.top + 16);
      }
      const bounds = popover.getBoundingClientRect();
      const shift = Math.max(left - bounds.left, Math.min(0, right - bounds.right));
      popover.style.translate = `${shift}px 0`;
      if (bounds.top < top) popover.style.height = `${Math.max(0, bounds.bottom - top)}px`;
    };
    position();
    const popover = popoverRef.current;
    if (popover) popover.addEventListener("toggle", position, true);
    window.addEventListener("resize", position);
    return () => {
      if (popover) popover.removeEventListener("toggle", position, true);
      window.removeEventListener("resize", position);
    };
  }, [fitViewport, children]);
  return (
    <div
      {...props}
      ref={popoverRef}
      className={cn(positionClassName, PROMPT_POPOVER, className)}
    >
      {children}
    </div>
  );
});

export function PromptPopoverHeader({ children, className = "" }) {
  return <div className={cn(PROMPT_POPOVER_SECTION, className)}>{children}</div>;
}

export function PromptMenuList({ children, className = "" }) {
  return <div role="menu" className={cn("flex flex-col gap-0.5", className)}>{children}</div>;
}

export function PromptMenuItem({
  children,
  description,
  wrapDescription = false,
  selected = false,
  className = "",
  type = "button",
  ...props
}) {
  return (
    <button
      {...props}
      type={type}
      aria-checked={selected}
      role="menuitemradio"
      className={cn(
        MENU_ITEM,
        MENU_ITEM_PAD,
        "min-h-control-md justify-between gap-3 py-1.5",
        selected && "text-brand",
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block truncate">{children}</span>
        {description && (
          <span
            className={cn(
              "mt-0.5 block text-caption text-ink-subtle",
              wrapDescription ? "whitespace-normal" : "truncate",
            )}
          >
            {description}
          </span>
        )}
      </span>
      {selected && <Check size={14} strokeWidth={2.4} aria-hidden className="shrink-0 text-brand" />}
    </button>
  );
}

export function PromptSegmentedControl({ children, className = "" }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-line bg-wash p-0.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PromptSegmentOption({
  children,
  selected = false,
  className = "",
  type = "button",
  ...props
}) {
  return (
    <button
      {...props}
      type={type}
      aria-pressed={selected}
      className={cn(
        "inline-flex select-none items-center justify-center gap-1.5",
        "transition-[background-color,color,box-shadow] duration-fast ease-standard",
        FOCUS_RING,
        controlClasses("xs", { pad: "px-2.5" }),
        selected
          ? "bg-brand font-semibold text-ink-on-accent shadow-elevation-1"
          : "text-ink-muted hover:bg-wash-strong hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function PromptComposer({
  children,
  className = "",
  panelClassName = "",
  positionClassName = DEFAULT_POSITION_CLASS,
  style = { animationDelay: "120ms" },
}) {
  return (
    <div
      className={cn(positionClassName, className)}
      style={style}
      data-prompt-composer=""
    >
      <div className={cn(PROMPT_PANEL, panelClassName)}>{children}</div>
    </div>
  );
}

export const PromptTextarea = forwardRef(function PromptTextarea(
  {
    value,
    onChange,
    onInput,
    className = "",
    maxHeightMobile = 152,
    maxHeightDesktop = 256,
    rows = 1,
    ...props
  },
  forwardedRef,
) {
  const internalRef = useRef(null);

  useImperativeHandle(forwardedRef, () => internalRef.current);

  const resize = useCallback(
    (element = internalRef.current) => {
      if (!element) return;

      element.style.height = "auto";
      const maxHeight =
        window.innerWidth < 768 ? maxHeightMobile : maxHeightDesktop;
      element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`;
    },
    [maxHeightDesktop, maxHeightMobile],
  );

  useEffect(() => {
    resize();
  }, [resize, value]);

  const handleChange = (event) => {
    onChange?.(event);
    resize(event.currentTarget);
  };

  const handleInput = (event) => {
    onInput?.(event);
    resize(event.currentTarget);
  };

  return (
    <textarea
      {...props}
      ref={internalRef}
      value={value}
      onChange={handleChange}
      onInput={handleInput}
      rows={rows}
      className={cn(PROMPT_TEXTAREA, className)}
    />
  );
});

export function PromptFooter({ children, className = "" }) {
  return <div className={cn(PROMPT_FOOTER, className)}>{children}</div>;
}

export const PromptControls = forwardRef(function PromptControls(
  { children, className = "" },
  ref,
) {
  return (
    <div ref={ref} className={cn(PROMPT_CONTROLS_ROW, className)}>
      {children}
    </div>
  );
});

export const PromptAction = forwardRef(function PromptAction(
  { children, className = "", type = "button", ...props },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={cn(
        CONTROL_BASE,
        controlClasses("lg", { pad: "px-6" }),
        BUTTON_WEIGHT.primary,
        BUTTON_VARIANTS.primary,
        "w-full shrink-0 sm:w-auto",
        className,
      )}
    >
      {children}
    </button>
  );
});
