"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient, safeNext } from "@/lib/auth-client";

export function AuthForm({ mode, next }: { mode: "sign-in" | "sign-up"; next?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email"));
    const password = String(fd.get("password"));
    const res =
      mode === "sign-in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: String(fd.get("name") || email.split("@")[0]) });
    setBusy(false);
    if (res.error) {
      setError(res.error.message ?? "That didn't work.");
      return;
    }
    router.push(safeNext(next));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {mode === "sign-up" && (
        <div>
          <label className="label" htmlFor="name">
            Your name
          </label>
          <input id="name" name="name" className="input" autoComplete="name" required />
        </div>
      )}
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" required />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password {mode === "sign-up" && <span className="normal-case">(10+ characters)</span>}
        </label>
        <input id="password" name="password" type="password" minLength={10} className="input" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required />
      </div>
      {error && <p className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>
        {busy ? "One moment…" : mode === "sign-in" ? "Sign in" : "Create coach account"}
      </button>
      <p className="text-center text-sm text-muted">
        {mode === "sign-in" ? (
          <>
            New coach? <Link className="font-semibold text-ink underline" href={`/sign-up${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Create an account</Link>
          </>
        ) : (
          <>
            Have an account? <Link className="font-semibold text-ink underline" href="/sign-in">Sign in</Link>
          </>
        )}
      </p>
    </form>
  );
}
