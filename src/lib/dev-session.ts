import "server-only";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSession } from "@/lib/session";

/**
 * DEVELOPMENT-ONLY session bypass.
 *
 * MeWe is the only identity provider, so without MEWE_APP_ID / MEWE_API_KEY
 * there is no way to obtain a session and every route returns 401 — which
 * makes the UI impossible to build or look at.
 *
 * This lets a developer sign in as a fake user instead. It is an
 * authentication bypass, so it is fenced three ways:
 *
 *   1. `process.env.NODE_ENV === "production"` disables it outright. Next
 *      sets this on every production build, so it cannot ship enabled.
 *   2. It additionally requires DEV_FAKE_USER to be set explicitly. Absent
 *      that, it stays off even in development.
 *   3. It is never imported by the real /api/session route, so the
 *      production auth path has no branch that can reach it.
 *
 * Delete this file once MeWe credentials are available.
 */
export function devAuthEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && Boolean(process.env.DEV_FAKE_USER);
}

export async function signInAsDevUser(): Promise<{ id: string; displayName: string }> {
  if (!devAuthEnabled()) {
    throw new Error("dev-auth-disabled");
  }

  const id = process.env.DEV_FAKE_USER!;
  const displayName = process.env.DEV_FAKE_NAME ?? id;

  await db
    .insert(users)
    .values({ id, displayName, avatarUrl: null })
    .onConflictDoUpdate({
      target: users.id,
      set: { displayName, lastSeenAt: new Date() },
    });

  const session = await getSession();
  session.userId = id;
  session.apiToken = "dev-no-mewe-token";
  session.expiresAt = new Date(Date.now() + 86_400_000).toISOString();
  await session.save();

  return { id, displayName };
}
