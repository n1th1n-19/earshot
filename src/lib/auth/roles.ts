/**
 * Authorization core.
 *
 * Pure functions only — no database, no media server, no network. Every
 * security invariant in the spec is decided here and is testable in
 * milliseconds. Nothing in this file may import from db/ or livekit/.
 */

export type Role = "host" | "cohost" | "speaker" | "invited" | "listener";

/**
 * `invited` and `listener` deliberately share rank 0. An invitation grants
 * standing to be promoted, not any privilege of its own — which also means
 * an invited user cannot moderate a plain listener.
 */
export const RANK: Record<Role, number> = {
  host: 3,
  cohost: 2,
  speaker: 1,
  invited: 0,
  listener: 0,
};

export const SPEAKER_CAP = 10;
export const COHOST_CAP = 2;

/**
 * The capability matrix lives in code, not in the database. There are five
 * fixed roles and ten fixed actions, none of which change at runtime; a
 * table-driven permission system would add a join to every authorization
 * check in exchange for flexibility that will never be used.
 *
 * Note what is absent: there is no `unmute` action, and there must never be
 * one. A host may mute a speaker; only that speaker may unmute themselves.
 * Keeping it out of this matrix means it cannot be granted by adding a role.
 */
export const CAN = {
  endRoom: ["host"],
  editSettings: ["host"],
  promote: ["host", "cohost"],
  demote: ["host", "cohost"],
  mute: ["host", "cohost"],
  removeOrBan: ["host", "cohost"],
  inviteSpeaker: ["host", "cohost"],
  publishAudio: ["host", "cohost", "speaker"],
  chatAndReact: ["host", "cohost", "speaker", "invited", "listener"],
  requestToSpeak: ["speaker", "invited", "listener"],
} as const satisfies Record<string, readonly Role[]>;

export type Action = keyof typeof CAN;

export function can(role: Role, action: Action): boolean {
  return (CAN[action] as readonly Role[]).includes(role);
}

/**
 * Strictly greater. Equal rank does NOT outrank — this is what stops a
 * co-host from banning another co-host, and the host from being ousted by
 * someone they promoted.
 */
export function outranks(actor: Role, target: Role): boolean {
  return RANK[actor] > RANK[target];
}

/**
 * The only correct way to authorize an action against another user.
 * Capability alone is insufficient: a co-host has `removeOrBan`, so without
 * the rank comparison they could ban the host and seize the room.
 */
export function canModerate(actor: Role, target: Role, action: Action): boolean {
  return can(actor, action) && outranks(actor, target);
}

/**
 * The single source of truth for the LiveKit publish grant. Database
 * authorization and media-server permissions are computed from this one
 * value, so they cannot drift apart.
 */
export function canPublish(role: Role): boolean {
  return RANK[role] >= RANK.speaker;
}
