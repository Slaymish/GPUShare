import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className = "", ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={`fixed inset-0 z-50 bg-black/30 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 ${className}`}
    {...props}
  />
));
SheetOverlay.displayName = "SheetOverlay";

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  side?: "left" | "right";
}

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ className = "", children, side = "left", ...props }, ref) => (
  <DialogPrimitive.Portal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={`fixed z-50 flex flex-col bg-white shadow-xl transition ease-in-out
        data-[state=open]:animate-in data-[state=closed]:animate-out duration-300
        ${side === "left"
          ? "inset-y-0 left-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left"
          : "inset-y-0 right-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
        } ${className}`}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = "SheetContent";

export const SheetHeader = ({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={`flex items-center justify-between p-3 border-b border-[#E5E1DB] shrink-0 ${className}`}
    {...props}
  />
);
SheetHeader.displayName = "SheetHeader";

export const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className = "", ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={`text-sm font-semibold text-[#2D2B28] ${className}`}
    {...props}
  />
));
SheetTitle.displayName = "SheetTitle";
