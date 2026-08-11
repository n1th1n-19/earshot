"use client";

import { MEWE_MSG, type HostDisplay, type HandshakeResult } from "./messages";

/**
 * Exact-match origin comparison.
 *
 * Never use startsWith, includes, or endsWith here: "https://mewe.com.evil.example"
 * starts with the expected origin, and "https://notmewe.com" ends with it. Both
 * would pass a substring check and hand an attacker the login token.
 */
export function isTrustedMessage(e: MessageEvent, expectedOrigin: string): boolean {
  return e.origin === expectedOrigin;
}

/**
 * Ask MeWe for a loginRequestToken. Resolves once HOST_HANDSHAKE_RESPONSE
 * arrives from the expected origin; rejects if MeWe never answers.
 */
export function handshake(
  expectedOrigin: string,
  timeoutMs = 10_000,
): Promise<HandshakeResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("handshake-timeout"));
    }, timeoutMs);

    function onMessage(e: MessageEvent) {
      if (!isTrustedMessage(e, expectedOrigin)) return; // ignore silently
      if (e.data?.type !== MEWE_MSG.HOST_HANDSHAKE_RESPONSE) return;

      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve({
        loginRequestToken: e.data.loginRequestToken,
        meweHost: e.data.meweHost,
      });
    }

    window.addEventListener("message", onMessage);
    window.parent.postMessage(
      { type: MEWE_MSG.CLIENT_HANDSHAKE_REQUEST },
      expectedOrigin,
    );
  });
}

export type LifecycleHandlers = {
  onDisplay?: (d: HostDisplay) => void;
  onMinimized?: () => void;
  onMaximized?: () => void;
  onPaused?: () => void;
  onResumed?: () => void;
  onClosed?: () => void;
};

/**
 * Subscribe to MeWe lifecycle messages. Returns an unsubscribe function.
 *
 * Audio policy, which the message names actively mislead about:
 *   PAUSED    — a close-confirmation dialog is showing. The app stays loaded.
 *               Pause animations and timers only. Do NOT stop audio.
 *   MINIMIZED — the background-listening state. Do NOT stop audio.
 *   CLOSED    — real teardown. Disconnect and release the microphone here.
 */
export function onLifecycle(
  expectedOrigin: string,
  handlers: LifecycleHandlers,
): () => void {
  function onMessage(e: MessageEvent) {
    if (!isTrustedMessage(e, expectedOrigin)) return;

    switch (e.data?.type) {
      case MEWE_MSG.HOST_DISPLAY_RESPONSE:
        handlers.onDisplay?.(e.data as HostDisplay);
        break;
      case MEWE_MSG.HOST_APP_MINIMIZED:
        handlers.onMinimized?.();
        break;
      case MEWE_MSG.HOST_APP_MAXIMIZED:
        handlers.onMaximized?.();
        break;
      case MEWE_MSG.HOST_APP_PAUSED:
        handlers.onPaused?.();
        break;
      case MEWE_MSG.HOST_APP_RESUMED:
        handlers.onResumed?.();
        break;
      case MEWE_MSG.HOST_APP_CLOSED:
        handlers.onClosed?.();
        break;
    }
  }

  window.addEventListener("message", onMessage);
  window.parent.postMessage(
    { type: MEWE_MSG.CLIENT_DISPLAY_REQUEST },
    expectedOrigin,
  );

  return () => window.removeEventListener("message", onMessage);
}
