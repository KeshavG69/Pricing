'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  hideCloseButton?: boolean;
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export const Dialog = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  hideCloseButton = false,
}: DialogProps) => {
  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={onClose}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="
            fixed inset-0 z-50 bg-background/80 backdrop-blur-sm
            data-[state=open]:animate-in data-[state=closed]:animate-out
            data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
          "
        />
        <DialogPrimitive.Content
          className={`
            fixed left-[50%] top-[50%] z-50 w-full ${sizeClasses[size]}
            translate-x-[-50%] translate-y-[-50%]
            bg-background border border-border rounded-lg shadow-lg
            data-[state=open]:animate-in data-[state=closed]:animate-out
            data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
            data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95
            data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]
            data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]
          `}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <DialogPrimitive.Title className="text-lg font-semibold text-foreground">
              {title}
            </DialogPrimitive.Title>
            {!hideCloseButton && (
              <DialogPrimitive.Close className="rounded-sm opacity-70 hover:opacity-100 transition-opacity">
                <X className="h-5 w-5 text-muted-foreground" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            )}
          </div>

          {/* Content */}
          <div className="p-6">{children}</div>

          {/* Footer */}
          {footer && (
            <div className="flex items-center justify-end space-x-2 p-6 border-t border-border bg-muted/20">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default Dialog;
