import { describe, it, expect } from "vitest";
import { isTrustedMessage } from "./client";

const MEWE = "https://mewe.com";
const ev = (origin: string) => ({ origin }) as MessageEvent;

describe("postMessage origin check", () => {
  it("accepts the expected origin", () => {
    expect(isTrustedMessage(ev(MEWE), MEWE)).toBe(true);
  });

  it("rejects an unrelated origin", () => {
    expect(isTrustedMessage(ev("https://evil.example"), MEWE)).toBe(false);
  });

  // The attacks a substring check would let through.
  it("rejects a suffix lookalike", () => {
    expect(isTrustedMessage(ev("https://mewe.com.evil.example"), MEWE)).toBe(false);
  });

  it("rejects a prefix lookalike", () => {
    expect(isTrustedMessage(ev("https://notmewe.com"), MEWE)).toBe(false);
  });

  it("rejects a subdomain", () => {
    expect(isTrustedMessage(ev("https://x.mewe.com"), MEWE)).toBe(false);
  });

  it("rejects the same host over http", () => {
    expect(isTrustedMessage(ev("http://mewe.com"), MEWE)).toBe(false);
  });

  it("rejects the null origin used by sandboxed frames", () => {
    expect(isTrustedMessage(ev("null"), MEWE)).toBe(false);
  });
});
