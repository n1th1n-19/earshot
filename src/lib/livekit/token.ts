import "server-only";
import { AccessToken } from "livekit-server-sdk";
import { canPublish, type Role } from "@/lib/auth/roles";

/**
 * The LiveKit grant, derived from the role and nothing else.
 *
 * This is the single point where database authorization becomes media-server
 * permission. Computing canPublish anywhere else would let the two drift.
 */
export function grantsFor(role: Role) {
  return {
    roomJoin: true,
    canSubscribe: true,
    canPublish: canPublish(role),
    // Chat and reactions ride the data channel, so everyone including
    // listeners may publish data. This is not an audio permission.
    canPublishData: true,
  };
}

export type MintOptions = {
  identity: string;
  name: string;
  room: string;
  role: Role;
};

export async function mintToken(opts: MintOptions): Promise<string> {
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!key || !secret) throw new Error("LIVEKIT_API_KEY/SECRET are not set");

  const at = new AccessToken(key, secret, {
    // The MeWe user id. Reusing it as the LiveKit identity means a second
    // tab displaces the first rather than creating a ghost participant.
    identity: opts.identity,
    name: opts.name,
    // Deliberately independent of the MeWe token lifetime. MeWe issues no
    // refresh token, so if room membership depended on it, a token expiring
    // mid-conversation would eject a live participant.
    ttl: "4h",
  });

  at.addGrant({ room: opts.room, ...grantsFor(opts.role) });
  return at.toJwt();
}
