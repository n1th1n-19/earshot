import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  pgEnum,
  unique,
} from "drizzle-orm/pg-core";

export const roomStatus = pgEnum("room_status", ["scheduled", "live", "ended"]);
export const speakerPolicy = pgEnum("speaker_policy", ["everyone", "invited"]);
export const memberRole = pgEnum("member_role", [
  "host",
  "cohost",
  "speaker",
  "invited",
]);

/** Mirrored from MeWe. The primary key is the MeWe user id, not a local one. */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow(),
});

export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  topics: text("topics").array(),
  status: roomStatus("status").notNull().default("scheduled"),
  speakerPolicy: speakerPolicy("speaker_policy").notNull().default("everyone"),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  /** Maintained from signed LiveKit webhooks; the only thing we keep about listeners. */
  peakListeners: integer("peak_listeners").notNull().default(0),
  livekitRoom: text("livekit_room").notNull().unique(),
});

/**
 * Durable stage membership.
 *
 * This table exists to survive reconnect. Media permissions come from the
 * token, and `updateParticipant` alters only a live session — once that
 * session ends the grant is gone. Without a durable role row, a promoted
 * speaker who refreshes would be minted a fresh listener token and silently
 * demoted mid-conversation, with no error surfaced anywhere.
 *
 * Listeners are deliberately not stored: they churn constantly and buy
 * nothing. Absence of a row means listener.
 */
export const roomMembers = pgTable(
  "room_members",
  {
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: memberRole("role").notNull(),
    grantedBy: text("granted_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [unique("room_members_room_user_uniq").on(t.roomId, t.userId)],
);

/**
 * Kept as its own table rather than a role value. This is the security
 * check, and a single-purpose table keeps that query unambiguous — an enum
 * filter where one typo silently grants access is a worse failure mode than
 * one extra table.
 */
export const roomBans = pgTable(
  "room_bans",
  {
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    bannedBy: text("banned_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [unique("room_bans_room_user_uniq").on(t.roomId, t.userId)],
);
