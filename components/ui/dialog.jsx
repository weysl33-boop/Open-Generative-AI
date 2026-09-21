import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DIALOG_CLOSE_BUTTON,
  DIALOG_DESCRIPTION,
  DIALOG_FOOTER,
  DIALOG_HEADER,
  DIALOG_TITLE,
  MODAL_PANEL,
  MODAL_PANEL_MOBILE,
  MODAL_SIZE,
  SCRIM,
} from "studio/ui/tokens";

/**
 * App-side dialog shell over the shared modal recipe.
 *
 * The previous file carried its own `bg-raised`, `z-50`, `max-h-[90vh]` and
 * a cyan focus ring, so the same product had two modal geometries. The recipe
 * now lives in studio/ui/tokens and this file only preserves the shadcn-style
 * compound API that existing pages compose with.
 */
function Dialog({ ...props }) {
  return <DialogPrimitive.Root {...props} />;
}

function DialogTrigger({ ...props }) {
  return <DialogPrimitive.Trigger {...props} />;
}

function DialogPortal({ ...props }) {
  return <DialogPrimitive.Portal {...props} />;
}

function DialogClose({ ...props }) {
  return <DialogPrimitive.Close {...props} />;
}

const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay ref={ref} className={cn(SCRIM, className)} {...props} />
));
DialogOverlay.displayName = "DialogOverlay";

const DialogContent = React.forwardRef(
  ({ className, children, size = "md", showClose = true, ...props }, ref) => (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          MODAL_PANEL,
          MODAL_PANEL_MOBILE,
          MODAL_SIZE[size] || MODAL_SIZE.md,
          className
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            aria-label="Close"
            className={cn(DIALOG_CLOSE_BUTTON, "absolute right-3 top-3")}
          >
            <XIcon className="size-4" strokeWidth={1.8} aria-hidden="true" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
);
DialogContent.displayName = "DialogContent";

function DialogHeader({ className, ...props }) {
  return <div className={cn(DIALOG_HEADER, "pr-10", className)} {...props} />;
}

function DialogFooter({ className, ...props }) {
  return <div className={cn(DIALOG_FOOTER, className)} {...props} />;
}

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn(DIALOG_TITLE, className)} {...props} />
));
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn(DIALOG_DESCRIPTION, className)}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
