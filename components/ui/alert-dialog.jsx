import * as React from "react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import {
  DIALOG_DESCRIPTION,
  DIALOG_FOOTER,
  DIALOG_HEADER,
  DIALOG_TITLE,
  MODAL_PANEL,
  MODAL_PANEL_MOBILE,
  MODAL_SIZE,
  SCRIM,
} from "studio/ui/tokens";
import { Button } from "@/components/ui/button";

/**
 * App-side alert-dialog shell.
 *
 * This file arrived from a shadcn registry template written for Tailwind v4:
 * `data-open:animate-in`, `fade-in-0`, `zoom-in-95`, `bg-muted/50`,
 * `ring-foreground/10` and `font-heading` are all classes this project cannot
 * generate — `plugins: []` in tailwind.config.js, so tw-animate-css is never
 * registered. Roughly half of the original recipe was inert. The confirm dialog
 * is now the same box as every other modal, narrowed to the small width.
 */
function AlertDialog({ ...props }) {
  return <AlertDialogPrimitive.Root {...props} />;
}

function AlertDialogTrigger({ ...props }) {
  return <AlertDialogPrimitive.Trigger {...props} />;
}

function AlertDialogPortal({ ...props }) {
  return <AlertDialogPrimitive.Portal {...props} />;
}

function AlertDialogOverlay({ className, ...props }) {
  return <AlertDialogPrimitive.Overlay className={cn(SCRIM, className)} {...props} />;
}

function AlertDialogContent({ className, ...props }) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        className={cn(
          MODAL_PANEL,
          MODAL_PANEL_MOBILE,
          MODAL_SIZE.sm,
          "grid gap-4 p-5",
          className
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({ className, ...props }) {
  return <div className={cn(DIALOG_HEADER, "items-center", className)} {...props} />;
}

function AlertDialogFooter({ className, ...props }) {
  return <div className={cn(DIALOG_FOOTER, "mt-0 sm:[&>*]:flex-1", className)} {...props} />;
}

function AlertDialogTitle({ className, ...props }) {
  return <AlertDialogPrimitive.Title className={cn(DIALOG_TITLE, className)} {...props} />;
}

function AlertDialogDescription({ className, ...props }) {
  return (
    <AlertDialogPrimitive.Description
      className={cn(DIALOG_DESCRIPTION, className)}
      {...props}
    />
  );
}

function AlertDialogAction({ className, variant = "primary", size = "md", ...props }) {
  return (
    <Button variant={variant} size={size} asChild>
      <AlertDialogPrimitive.Action className={className} {...props} />
    </Button>
  );
}

function AlertDialogCancel({ className, variant = "secondary", size = "md", ...props }) {
  return (
    <Button variant={variant} size={size} asChild>
      <AlertDialogPrimitive.Cancel className={className} {...props} />
    </Button>
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
