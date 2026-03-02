'use client';

import React, { useState } from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
  children?: React.ReactNode;
}

export default function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  className = '',
  onClick,
  ...props
}: ButtonProps) {
  const [isPressed, setIsPressed] = useState(false);

  const baseStyles = 'relative transition-all duration-200 ease-out';
  
  const variantStyles = {
    primary: 'bg-primary hover:bg-blue-500 text-white shadow-lg shadow-primary/20',
    secondary: 'bg-panel-bg hover:bg-white/10 text-text-secondary hover:text-white',
    ghost: 'bg-transparent hover:bg-white/5 text-text-secondary hover:text-white',
  };

  const sizeStyles = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-4 py-1.5 text-sm',
    lg: 'px-6 py-2 text-base',
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    setIsPressed(true);
    setTimeout(() => setIsPressed(false), 150);
    onClick?.(e);
  };

  return (
    <button
      {...props}
      onClick={handleClick}
      className={`
        ${baseStyles}
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${isPressed ? 'scale-95' : 'scale-100'}
        ${className}
        active:scale-95
        focus:outline-none focus:ring-2 focus:ring-primary/50
      `}
    >
      <span className={`flex items-center justify-center gap-2 ${isPressed ? 'animate-pulse' : ''}`}>
        {icon && <span className="material-icons text-lg">{icon}</span>}
        {children}
      </span>
      {/* Ripple effect */}
      {isPressed && (
        <span className="absolute inset-0 rounded-lg bg-white/20 animate-ping opacity-75"></span>
      )}
    </button>
  );
}
