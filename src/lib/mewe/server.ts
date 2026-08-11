import "server-only";

/**
 * MeWe API calls. These run on the server only — MeWe requires it, and
 * X-App-Id / X-Api-Key must never reach a client bundle.
 */

export type MeWeToken = { apiToken: string; expiresAt: string };
export type MeWeProfile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

/**
 * Exchange the loginRequestToken from the handshake for an apiToken.
 *
 * MeWe issues no refresh token: when this expires the whole flow repeats.
 * That is why the apiToken is consumed at session establishment only, and
 * never governs room membership — the LiveKit token does that, with a
 * lifetime we control.
 */
export async function exchangeToken(
  meweHost: string,
  loginRequestToken: string,
): Promise<MeWeToken> {
  const url = `${meweHost}/api/dev/token?loginRequestToken=${encodeURIComponent(loginRequestToken)}`;

  const res = await fetch(url, {
    headers: {
      "X-App-Id": requireEnv("MEWE_APP_ID"),
      "X-Api-Key": requireEnv("MEWE_API_KEY"),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`mewe-token-exchange-failed:${res.status}`);
  }
  return (await res.json()) as MeWeToken;
}

/**
 * Fetch the signed-in user's profile.
 *
 * UNVERIFIED: MeWe's API reference did not render during research, so the
 * exact path and response shape are unconfirmed (spec §13.4). The field
 * fallbacks below are defensive guesses. Confirm against the live API during
 * this task and correct the path if it differs.
 */
export async function fetchProfile(
  meweHost: string,
  apiToken: string,
): Promise<MeWeProfile> {
  const res = await fetch(`${meweHost}/api/v2/me`, {
    headers: {
      "X-App-Id": requireEnv("MEWE_APP_ID"),
      Authorization: `Bearer ${apiToken}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`mewe-profile-failed:${res.status}`);
  }

  const j = await res.json();
  const id = j?.id ?? j?.userId;
  if (!id) throw new Error("mewe-profile-missing-id");

  return {
    id: String(id),
    displayName: j.name ?? j.displayName ?? j.fullName ?? "Unknown",
    avatarUrl: j.avatarUrl ?? j.avatar ?? null,
  };
}
