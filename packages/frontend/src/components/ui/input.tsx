import * as React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', type = 'text', ...props }, ref) => {
    return (
      <input
        type={type}
        className={`w-full bg-[#EDEAE3] border border-[#E5E1DB] rounded-lg px-3 py-2 text-sm text-[#2D2B28] placeholder:text-[#B1ADA1] focus:outline-none focus:border-[#C15F3C] focus:ring-1 focus:ring-[#C15F3C] disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        ref={ref}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
