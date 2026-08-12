import { NextResponse } from "next/server";
import { devAuthEnabled, signInAsDevUser } from "@/lib/dev-session";

/**
 * Development-only. Returns 404 in production and whenever DEV_FAKE_USER is
 * unset, so the endpoint is indistinguishable from not existing.
 */
export async function POST() {
  if (!devAuthEnabled()) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  const user = await signInAsDevUser();
  return NextResponse.json({ user, dev: true });
}
