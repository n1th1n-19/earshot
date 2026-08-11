import "server-only";
import { getIronSession, type IronSession } from "iron-session";
import { cookies } from "next/headers";

export type SessionData = {
  userId?: string;
  /** MeWe apiToken. Encrypted at rest in the cookie; never sent to the client. */
  apiToken?: string;
  expiresAt?: string;
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const password = process.env.SESSION_SECRET;
  if (!password) throw new Error("SESSION_SECRET is not set");

  return getIronSession<SessionData>(await cookies(), {
    password,
    cookieName: "earshot_session",
    cookieOptions: {
      httpOnly: true,
      secure: true,
      // REQUIRED: the cookie is set inside a cross-site iframe. The default
      // "lax" would be dropped by the browser and the symptom is "login
      // silently does nothing" with no error anywhere. "none" demands secure.
      sameSite: "none",
      path: "/",
    },
  });
}
