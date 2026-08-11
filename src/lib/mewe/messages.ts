/**
 * The postMessage protocol MeWe uses to talk to embedded apps.
 * Names and payload fields come from MeWe's embedded-communication docs.
 */

export const MEWE_MSG = {
  CLIENT_HANDSHAKE_REQUEST: "CLIENT_HANDSHAKE_REQUEST",
  HOST_HANDSHAKE_RESPONSE: "HOST_HANDSHAKE_RESPONSE",
  CLIENT_DISPLAY_REQUEST: "CLIENT_DISPLAY_REQUEST",
  HOST_DISPLAY_RESPONSE: "HOST_DISPLAY_RESPONSE",
  CLIENT_DISPLAY_UPDATE: "CLIENT_DISPLAY_UPDATE",
  HOST_APP_PAUSED: "HOST_APP_PAUSED",
  HOST_APP_RESUMED: "HOST_APP_RESUMED",
  HOST_APP_MINIMIZED: "HOST_APP_MINIMIZED",
  HOST_APP_MAXIMIZED: "HOST_APP_MAXIMIZED",
  HOST_APP_CLOSED: "HOST_APP_CLOSED",
} as const;

export type HostDisplay = {
  width: number;
  height: number;
  availableWidth: number;
  viewportHeight: number;
  isMinimized: boolean;
  isPaused: boolean;
};

export type HandshakeResult = {
  loginRequestToken: string;
  meweHost: string;
};
