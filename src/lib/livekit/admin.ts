import "server-only";
import { RoomServiceClient } from "livekit-server-sdk";

/**
 * Server-side LiveKit administration.
 *
 * There is deliberately no unmute function in this module, and there must
 * never be one. `svc.mutePublishedTrack(room, identity, sid, false)` would
 * unmute a participant remotely; the spec forbids it for every role
 * including host. A speaker may only be unmuted by themselves.
 */

// Constructed lazily so importing this module does not require credentials —
// otherwise a build or a test that merely touches the import chain fails.
let client: RoomServiceClient | null = null;

function svc(): RoomServiceClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret) {
    throw new Error("LIVEKIT_API_KEY/SECRET and NEXT_PUBLIC_LIVEKIT_URL must be set");
  }

  client = new RoomServiceClient(url.replace(/^wss:\/\//, "https://"), key, secret);
  return client;
}

/** Promotion and demotion both route through here. */
export async function setCanPublish(
  room: string,
  identity: string,
  canPublish: boolean,
): Promise<void> {
  await svc().updateParticipant(room, identity, undefined, {
    canPublish,
    canSubscribe: true,
    canPublishData: true,
  });
}

/** Mute only. The `true` below is not a parameter by design. */
export async function muteTrack(
  room: string,
  identity: string,
  trackSid: string,
): Promise<void> {
  await svc().mutePublishedTrack(room, identity, trackSid, true);
}

export async function removeParticipant(room: string, identity: string): Promise<void> {
  await svc().removeParticipant(room, identity);
}

export async function listParticipants(room: string) {
  return svc().listParticipants(room);
}
