import { describe, it, expect, beforeAll } from "vitest";
import { grantsFor } from "./token";

describe("grants derive from role", () => {
  it("speaker may publish audio", () => {
    expect(grantsFor("speaker").canPublish).toBe(true);
  });

  it("listener may subscribe but not publish", () => {
    const g = grantsFor("listener");
    expect(g.canPublish).toBe(false);
    expect(g.canSubscribe).toBe(true);
  });

  it("invited may not publish — an invitation is not a grant", () => {
    expect(grantsFor("invited").canPublish).toBe(false);
  });

  it("everyone may publish data, so listeners can chat and react", () => {
    expect(grantsFor("listener").canPublishData).toBe(true);
    expect(grantsFor("host").canPublishData).toBe(true);
  });
});

/**
 * Signing a JWT needs a key pair but not a LiveKit server, so the whole
 * role -> grant -> token path is verifiable offline with dummy credentials.
 * This is what actually catches a wiring mistake between canPublish() and
 * the claims that reach the media server.
 */
describe("minted token carries the correct claims", () => {
  let mintToken: typeof import("./token").mintToken;

  beforeAll(async () => {
    process.env.LIVEKIT_API_KEY = "devkey";
    process.env.LIVEKIT_API_SECRET = "devsecret-at-least-32-characters-long";
    ({ mintToken } = await import("./token"));
  });

  const claims = (jwt: string) =>
    JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());

  it("grants publish to a speaker", async () => {
    const jwt = await mintToken({
      identity: "u1", name: "Alex", room: "lk-1", role: "speaker",
    });
    const video = claims(jwt).video;
    expect(video.canPublish).toBe(true);
    expect(video.room).toBe("lk-1");
  });

  it("withholds publish from a listener", async () => {
    const jwt = await mintToken({
      identity: "u2", name: "Sara", room: "lk-1", role: "listener",
    });
    const video = claims(jwt).video;
    expect(video.canPublish).toBe(false);
    expect(video.canSubscribe).toBe(true);
  });

  it("uses the supplied identity as the token subject", async () => {
    const jwt = await mintToken({
      identity: "mewe-user-42", name: "Jo", room: "lk-1", role: "host",
    });
    expect(claims(jwt).sub).toBe("mewe-user-42");
  });
});
