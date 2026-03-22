import * as React from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = '', ...props }, ref) => {
    return (
      <textarea
        className={`w-full bg-[#EDEAE3] border border-[#E5E1DB] rounded-lg px-3 py-2 text-sm text-[#2D2B28] placeholder:text-[#B1ADA1] focus:outline-none focus:border-[#C15F3C] focus:ring-1 focus:ring-[#C15F3C] disabled:opacity-50 disabled:cursor-not-allowed resize-none ${className}`}
        ref={ref}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';
