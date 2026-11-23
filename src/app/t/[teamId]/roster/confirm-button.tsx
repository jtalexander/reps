"use client";

/** A form button that asks before it submits (for things that can't be undone). */
export function ConfirmButton({
  formAction,
  message,
  className,
  children,
}: {
  formAction: (fd: FormData) => void | Promise<void>;
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      formAction={formAction}
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
