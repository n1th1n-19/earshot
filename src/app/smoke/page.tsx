"use client";

import { useEffect, useRef, useState } from "react";
import { handshake, onLifecycle } from "@/lib/mewe/client";

const ORIGIN = process.env.NEXT_PUBLIC_MEWE_ORIGIN ?? "https://mewe.com";

/**
 * Step 1 smoke page (spec §3).
 *
 * Confirms four things inside the real MeWe iframe:
 *   1. the postMessage handshake completes
 *   2. the token exchange succeeds
 *   3. getUserMedia is permitted — and if not, exactly why
 *   4. which lifecycle messages arrive, in what order
 */
export default function Smoke() {
  const [log, setLog] = useState<string[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const add = (s: string) =>
      setLog((l) => [...l, `${new Date().toISOString().slice(11, 19)}  ${s}`]);

    const off = onLifecycle(ORIGIN, {
      onDisplay: (d) =>
        add(`DISPLAY ${d.width}x${d.height} min=${d.isMinimized} paused=${d.isPaused}`),
      onMinimized: () => add("MINIMIZED — audio must keep playing"),
      onMaximized: () => add("MAXIMIZED"),
      onPaused: () => add("PAUSED — dialog only, audio must keep playing"),
      onResumed: () => add("RESUMED"),
      onClosed: () => add("CLOSED — teardown"),
    });

    handshake(ORIGIN)
      .then(async ({ loginRequestToken, meweHost }) => {
        add(`HANDSHAKE ok · host=${meweHost}`);
        const r = await fetch("/api/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ loginRequestToken, meweHost }),
        });
        const body = await r.json().catch(() => ({}));
        add(`SESSION ${r.status} ${r.ok ? `user=${body?.user?.displayName}` : JSON.stringify(body)}`);
      })
      .catch((e: Error) => add(`HANDSHAKE FAILED ${e.message}`));

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((s) => {
        add("MIC ok — the iframe permission assumption holds");
        s.getTracks().forEach((t) => t.stop());
      })
      .catch((e: DOMException) => {
        const why =
          e.name === "NotAllowedError"
            ? "iframe policy block OR user denial — check whether a prompt appeared"
            : e.name === "NotFoundError"
              ? "no input device"
              : e.message;
        add(`MIC FAILED ${e.name} — ${why}`);
      });

    return off;
  }, []);

  return (
    <main className="flex-1 overflow-y-auto p-4">
      <h1 className="display" style={{ fontSize: "var(--t-title)" }}>
        Smoke test
      </h1>
      {/* A looping tone makes it audible whether minimize really keeps audio alive. */}
      <audio ref={audioRef} controls loop className="my-3 w-full max-w-sm" src="/tone.wav" />
      <pre className="data whitespace-pre-wrap text-dim" style={{ fontSize: 11 }}>
        {log.join("\n") || "waiting…"}
      </pre>
    </main>
  );
}
