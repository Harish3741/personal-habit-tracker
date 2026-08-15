/**
 * Next calls this once per server start. It kicks off an initial calendar pull
 * and arms the hourly refresh, so the app is warm the moment the browser opens.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startScheduler, syncAll } = await import("./lib/sync.js");
  startScheduler();
  syncAll().catch(() => {
    /* per-calendar failures are recorded in sync_state and surfaced in the UI */
  });
}
