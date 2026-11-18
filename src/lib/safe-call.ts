/**
 * Run a server action from the browser and always get a result back. A
 * rejected request (network drop, a 413 from the host, a function timeout)
 * becomes { ok: false } with a plain message, so the UI never spins forever.
 */
export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function safeCall<T extends object>(fn: () => Promise<ActionResult<T>>, what: string): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // The page was loaded from an older deploy than the server now runs.
    if (/Server Action .* was not found|failed-to-find-server-action/i.test(msg)) {
      return { ok: false, error: `${what} didn't go through because Reps was just updated. Reload this page and try again.` };
    }
    const hint = /413|too large|payload/i.test(msg)
      ? "the file piece was too large for the server"
      : /timeout|timed out|504|502/i.test(msg)
        ? "the server took too long"
        : /fetch|network/i.test(msg)
          ? "the connection dropped"
          : msg;
    return { ok: false, error: `${what} failed: ${hint}. Try again; if it keeps failing, tell your app admin.` };
  }
}
