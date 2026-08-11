import { describe, it, expect } from "vitest";
import * as roles from "./roles";
import { can, outranks, canModerate, canPublish } from "./roles";

describe("capability matrix", () => {
  it("listener cannot promote, mute, or ban", () => {
    expect(can("listener", "promote")).toBe(false);
    expect(can("listener", "mute")).toBe(false);
    expect(can("listener", "removeOrBan")).toBe(false);
  });

  it("only the host can end the room", () => {
    expect(can("host", "endRoom")).toBe(true);
    expect(can("cohost", "endRoom")).toBe(false);
  });
});

describe("rank rule", () => {
  it("cohost cannot ban the host", () => {
    expect(canModerate("cohost", "host", "removeOrBan")).toBe(false);
  });

  it("cohost cannot ban another cohost", () => {
    expect(canModerate("cohost", "cohost", "removeOrBan")).toBe(false);
  });

  it("host can ban a cohost", () => {
    expect(canModerate("host", "cohost", "removeOrBan")).toBe(true);
  });

  it("invited does not outrank a listener — equal rank", () => {
    expect(outranks("invited", "listener")).toBe(false);
  });
});

describe("media grant", () => {
  it("canPublish is true for host, cohost, and speaker", () => {
    expect(canPublish("host")).toBe(true);
    expect(canPublish("cohost")).toBe(true);
    expect(canPublish("speaker")).toBe(true);
  });

  it("canPublish is false for listener and invited — an invitation is not a grant", () => {
    expect(canPublish("listener")).toBe(false);
    expect(canPublish("invited")).toBe(false);
  });
});

describe("global invariant: remote unmute cannot exist", () => {
  // These guard against a future edit rather than current behaviour. The
  // invariant is "this capability must never exist", which a behavioural
  // test cannot express.
  it("exports no function whose name suggests unmuting", () => {
    const exported = Object.keys(roles).join(" ").toLowerCase();
    expect(exported).not.toContain("unmute");
  });

  it("has no unmute capability in the matrix", () => {
    const actions = Object.keys(roles.CAN).join(" ").toLowerCase();
    expect(actions).not.toContain("unmute");
  });
});
