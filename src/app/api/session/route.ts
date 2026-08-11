import { NextResponse } from "next/server";
import { z } from "zod";
import { exchangeToken, fetchProfile } from "@/lib/mewe/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

const Body = z.object({
  loginRequestToken: z.string().min(1),
  meweHost: z.string().url(),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  const { loginRequestToken, meweHost } = parsed.data;

  // meweHost arrives from a postMessage payload, so it is attacker-influenced
  // input. Pin it to the configured origin before using it as a fetch target,
  // otherwise this endpoint becomes an SSRF that leaks X-Api-Key.
  let hostOrigin: string;
  try {
    hostOrigin = new URL(meweHost).origin;
  } catch {
    return NextResponse.json({ error: "bad-host" }, { status: 400 });
  }
  if (hostOrigin !== process.env.MEWE_ORIGIN) {
    return NextResponse.json({ error: "bad-host" }, { status: 400 });
  }

  try {
    const { apiToken, expiresAt } = await exchangeToken(hostOrigin, loginRequestToken);
    const profile = await fetchProfile(hostOrigin, apiToken);

    await db
      .insert(users)
      .values({
        id: profile.id,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          lastSeenAt: new Date(),
        },
      });

    const session = await getSession();
    session.userId = profile.id;
    session.apiToken = apiToken;
    session.expiresAt = expiresAt;
    await session.save();

    // Deliberately does not echo the apiToken back to the client.
    return NextResponse.json({
      user: {
        id: profile.id,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: "auth-failed", detail: message }, { status: 502 });
  }
}
