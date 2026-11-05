"use client";

import type { ReactNode } from "react";

export function ConfirmSubmit({
  message,
  disabled,
  className,
  title,
  children,
}: {
  message: string;
  disabled?: boolean;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      title={title}
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
