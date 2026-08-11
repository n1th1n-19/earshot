import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getRoom, getRoleInRoom, isBanned } from "@/lib/rooms/queries";
import { mintToken } from "@/lib/livekit/token";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "no-session" }, { status: 401 });
  }

  const room = await getRoom(id);
  if (!room) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  if (room.status === "ended") {
    return NextResponse.json({ error: "room-ended" }, { status: 410 });
  }

  // The ban check lives HERE, at token mint — never only in the UI. A banned
  // user with a stale page open still cannot obtain a token to reconnect.
  if (await isBanned(id, session.userId)) {
    return NextResponse.json({ error: "banned" }, { status: 403 });
  }

  // Read the durable role. This is what stops a speaker who refreshed from
  // being silently handed a listener token.
  const role = await getRoleInRoom(id, session.userId);

  const [user] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, session.userId));

  const token = await mintToken({
    identity: session.userId,
    name: user?.displayName ?? "Unknown",
    room: room.livekitRoom,
    role,
  });

  return NextResponse.json({
    token,
    url: process.env.NEXT_PUBLIC_LIVEKIT_URL,
    role,
  });
}
