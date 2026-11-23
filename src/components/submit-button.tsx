"use client";
import { useFormStatus } from "react-dom";

/** A form's submit button that shows it's working, so nobody taps twice. */
export function SubmitButton({ children, pending, className = "btn btn-primary" }: { children: React.ReactNode; pending: string; className?: string }) {
  const { pending: busy } = useFormStatus();
  return (
    <button className={className} disabled={busy} aria-busy={busy}>
      {busy ? pending : children}
    </button>
  );
}
