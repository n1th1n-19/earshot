import "server-only";
import { and, eq, count } from "drizzle-orm";
import { db } from "@/lib/db";
import { rooms, roomMembers, roomBans } from "@/lib/db/schema";
import type { Role } from "@/lib/auth/roles";

/** Roles that can actually appear as a row. Listener is the absence of one. */
export type StoredRole = "host" | "cohost" | "speaker" | "invited";

export async function getRoom(id: string) {
  const [row] = await db.select().from(rooms).where(eq(rooms.id, id));
  return row ?? null;
}

/**
 * The role lookup that makes roles survive a refresh. Absence of a row means
 * listener — listeners are never stored.
 */
export async function getRoleInRoom(roomId: string, userId: string): Promise<Role> {
  const [row] = await db
    .select({ role: roomMembers.role })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));

  return row?.role ?? "listener";
}

export async function isBanned(roomId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: roomBans.userId })
    .from(roomBans)
    .where(and(eq(roomBans.roomId, roomId), eq(roomBans.userId, userId)));

  return Boolean(row);
}

/** Used to enforce SPEAKER_CAP and COHOST_CAP. Counts in SQL, not in JS. */
export async function countByRole(roomId: string, role: StoredRole): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.role, role)));

  return row?.n ?? 0;
}
